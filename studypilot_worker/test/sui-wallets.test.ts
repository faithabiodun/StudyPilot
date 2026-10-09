import { describe, expect, it, vi } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { MultiSigPublicKey } from "@mysten/sui/multisig";
import { getZkLoginSignature, toZkLoginPublicIdentifier } from "@mysten/sui/zklogin";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { suiAuthOrigin, verifyPersonalMessage, SuiVerificationError, SuiVerificationUnavailable } from "../src/auth/sui";
// @ts-expect-error Frontend utilities are JavaScript.
import { supportsSuiSignIn, signWalletPersonalMessage } from "../../studypilot/src/utils/suiWallet.js";

const message = "Sign in to StudyPilot with this one-time challenge";
const bytes = new TextEncoder().encode(message);
const seed = new Uint8Array(32).fill(7);

describe("wallet signature compatibility", () => {
  it.each([
    ["Ed25519", Ed25519Keypair.fromSecretKey(seed)],
    ["Secp256k1", Secp256k1Keypair.fromSecretKey(seed)],
    ["Secp256r1", Secp256r1Keypair.fromSecretKey(seed)],
  ] as const)("verifies %s wallets and rejects other addresses and altered messages", async (_name, key) => {
    const { signature } = await key.signPersonalMessage(bytes);
    expect(await verifyPersonalMessage(message, signature, key.toSuiAddress())).toBe(key.toSuiAddress());
    await expect(verifyPersonalMessage(message + "changed", signature, key.toSuiAddress())).rejects.toBeInstanceOf(SuiVerificationError);
    await expect(verifyPersonalMessage(message, signature, "0x1")).rejects.toBeInstanceOf(SuiVerificationError);
  });

  it("requires the multisig threshold and verifies its account address", async () => {
    const keys = [Ed25519Keypair.fromSecretKey(seed), Secp256k1Keypair.fromSecretKey(seed)];
    const publicKey = MultiSigPublicKey.fromPublicKeys({ threshold: 2, publicKeys: keys.map((key) => ({ publicKey: key.getPublicKey(), weight: 1 })) });
    const parts = await Promise.all(keys.map(async (key) => (await key.signPersonalMessage(bytes)).signature));
    const signature = publicKey.combinePartialSignatures(parts);
    expect(await verifyPersonalMessage(message, signature, publicKey.toSuiAddress())).toBe(publicKey.toSuiAddress());
    await expect(verifyPersonalMessage(message, publicKey.combinePartialSignatures(parts.slice(0, 1)), publicKey.toSuiAddress())).rejects.toBeInstanceOf(SuiVerificationError);
  });

  async function zkFixture() {
    const key = Ed25519Keypair.fromSecretKey(seed);
    const { signature: userSignature } = await key.signPersonalMessage(bytes);
    const issuer = "https://accounts.google.com";
    const signature = getZkLoginSignature({ maxEpoch: 100, userSignature,
      inputs: { proofPoints: { a: ["0"], b: [["0"]], c: ["0"] },
        issBase64Details: { value: Buffer.from(`"iss":"${issuer}",`).toString("base64url"), indexMod4: 0 },
        headerBase64: "test", addressSeed: "1" } });
    return { signature, address: toZkLoginPublicIdentifier(1n, issuer, { legacyAddress: false }).toSuiAddress() };
  }

  it("delegates zkLogin proof validation to Sui and never accepts rejected proofs", async () => {
    // The fixture is a parsable envelope, not a valid ZK proof. Only the Sui
    // verifier can authorize it; these tests exercise that trust boundary.
    const { signature, address } = await zkFixture();
    const verify = vi.fn(async () => ({ success: true, errors: [] }));
    const client = { core: { verifyZkLoginSignature: verify } } as unknown as ClientWithCoreApi;
    expect(await verifyPersonalMessage(message, signature, address, client)).toBe(address);
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ bytes: Buffer.from(bytes).toString("base64"), signature, intentScope: "PersonalMessage" }));
    verify.mockResolvedValue({ success: false, errors: [] });
    await expect(verifyPersonalMessage(message, signature, address, client)).rejects.toBeInstanceOf(SuiVerificationError);
  });

  it("distinguishes a zkLogin network outage from an invalid signature", async () => {
    const { signature, address } = await zkFixture();
    const verify = vi.fn(async () => { throw new Error("RPC unavailable"); });
    const client = { core: { verifyZkLoginSignature: verify } } as unknown as ClientWithCoreApi;
    await expect(verifyPersonalMessage(message, signature, address, client)).rejects.toBeInstanceOf(SuiVerificationUnavailable);
    verify.mockRejectedValue(Object.assign(new Error("Invalid proof"), { code: "INVALID_ARGUMENT" }));
    await expect(verifyPersonalMessage(message, signature, address, client)).rejects.toBeInstanceOf(SuiVerificationError);
  });

  it.each(["bad signature", "AA==", "////"])("rejects malformed signatures", async (signature) => {
    await expect(verifyPersonalMessage(message, signature, "0x1")).rejects.toBeInstanceOf(SuiVerificationError);
  });
});

describe("wallet selection and popup signing", () => {
  it("selects personal-message signers and excludes wallets that only sign transactions", () => {
    expect(supportsSuiSignIn({ features: { "sui:signPersonalMessage": {} } })).toBe(true);
    expect(supportsSuiSignIn({ features: { "sui:signMessage": {} } })).toBe(true);
    expect(supportsSuiSignIn({ features: { "sui:signTransaction": {} } })).toBe(false);
  });
  it("invokes the wallet in the click's synchronous call stack", async () => {
    const sign = vi.fn(async () => ({ signature: "signed", bytes: "bytes" }));
    const account = { address: "0x1" };
    const pending = signWalletPersonalMessage({ features: { "sui:signPersonalMessage": { signPersonalMessage: sign } } }, account, bytes);
    expect(sign).toHaveBeenCalledWith({ account, message: bytes, chain: "sui:mainnet" });
    expect((await pending).signature).toBe("signed");
  });
  it("supports the legacy message-signing feature", async () => {
    const sign = vi.fn(async () => ({ signature: "signed", messageBytes: "bytes" }));
    expect(await signWalletPersonalMessage({ features: { "sui:signMessage": { signMessage: sign } } }, { address: "0x1" }, bytes)).toEqual({ signature: "signed", bytes: "bytes" });
  });
});

describe("Sui public origin", () => {
  it("corrects Vercel's internal HTTP URL without accepting forwarded headers", () => {
    expect(suiAuthOrigin("http://studypilot.test/api/auth/sui", undefined, "1")).toBe("https://studypilot.test");
    expect(suiAuthOrigin("http://localhost:8787/api/auth/sui")).toBe("http://localhost:8787");
    expect(suiAuthOrigin("http://internal/api/auth/sui", "https://studypilot.test", "1")).toBe("https://studypilot.test");
  });
});
