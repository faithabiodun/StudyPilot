// Verify Sui wallet personal-message signatures. Port of apps/accounts/sui.py.
//
// Sui does not sign the raw bytes: it prefixes an intent, BCS-encodes the
// message, hashes with blake2b-256, and signs that digest. The SDK verifies the
// signature and checks that its public identity matches the claimed address.
// Skipping the last step would let anyone
// log in as anyone by pairing their own valid signature with another address.
//
// Use the Sui SDK for wallet signature formats, including zkLogin and passkeys.

import { blake2b } from "@noble/hashes/blake2.js";
import { parseSerializedSignature } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { isValidPersonalMessageSignature } from "@mysten/sui/verify";
import type { ClientWithCoreApi } from "@mysten/sui/client";

const SIGNATURE_SCHEME_ED25519 = 0x00;
// IntentScope::PersonalMessage, IntentVersion::V0, AppId::Sui
const PERSONAL_MESSAGE_INTENT = [3, 0, 0];

export class SuiVerificationError extends Error {}
export class SuiVerificationUnavailable extends Error {}

// Vercel terminates TLS before handing requests to Node. Never use its
// internal HTTP scheme in the message shown to a wallet on the HTTPS website.
export function suiAuthOrigin(requestUrl: string, configuredOrigin?: string, vercel?: string): string {
  if (configuredOrigin) return new URL(configuredOrigin).origin;
  const url = new URL(requestUrl);
  if (vercel === "1") url.protocol = "https:";
  return url.origin;
}

const verificationClient = new SuiGrpcClient({ network: "mainnet", baseUrl: "https://fullnode.mainnet.sui.io:443", timeout: 15000 });

function uleb128(value: number): number[] {
  const out: number[] = [];
  for (;;) {
    const byte = value & 0x7f;
    value >>>= 7;
    if (value) out.push(byte | 0x80);
    else {
      out.push(byte);
      return out;
    }
  }
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function normalizeAddress(address: unknown): string {
  if (!address || typeof address !== "string") throw new SuiVerificationError("A Sui address is required.");
  const value = address.trim().toLowerCase();
  if (!value.startsWith("0x")) throw new SuiVerificationError("Sui address must start with 0x.");
  const body = value.slice(2);
  if (!body || body.length > 64 || !/^[0-9a-f]+$/.test(body)) throw new SuiVerificationError("Sui address is not valid hex.");
  return "0x" + body.padStart(64, "0");
}

export function addressFromPublicKey(publicKey: Uint8Array, scheme = SIGNATURE_SCHEME_ED25519): string {
  return "0x" + hex(blake2b(new Uint8Array([scheme, ...publicKey]), { dkLen: 32 }));
}

export function personalMessageDigest(message: Uint8Array): Uint8Array<ArrayBuffer> {
  return blake2b(new Uint8Array([...PERSONAL_MESSAGE_INTENT, ...uleb128(message.length), ...message]), { dkLen: 32 });
}

function decodeBase64Strict(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new SuiVerificationError("Signature is not valid base64.");
  }
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    throw new SuiVerificationError("Signature is not valid base64.");
  }
}

/** Return the verified address, or throw SuiVerificationError. */
export async function verifyPersonalMessage(message: string, signatureB64: string, claimedAddress: string, client: ClientWithCoreApi = verificationClient): Promise<string> {
  if (!signatureB64 || typeof signatureB64 !== "string") throw new SuiVerificationError("A wallet signature is required.");
  decodeBase64Strict(signatureB64);
  const address = normalizeAddress(claimedAddress);
  let scheme: string;
  try {
    scheme = parseSerializedSignature(signatureB64).signatureScheme;
  } catch {
    throw new SuiVerificationError("Wallet signature format is not valid.");
  }
  let valid: boolean;
  try {
    valid = await isValidPersonalMessageSignature(new TextEncoder().encode(message), signatureB64, { address, client });
  } catch (error) {
    const invalidProof = (error as { code?: string })?.code === "INVALID_ARGUMENT";
    if (scheme === "ZkLogin" && !invalidProof) throw new SuiVerificationUnavailable("Sui wallet verification is temporarily unavailable. Please try signing in again.");
    throw new SuiVerificationError("Wallet signature could not be verified.");
  }
  if (!valid) throw new SuiVerificationError("Signature does not match the message or given Sui address.");
  // SDK verification checks the claimed address, including legacy zkLogin
  // derivations. Keep that address rather than deriving a different alias.
  return address;
}
