// Verify Sui wallet personal-message signatures. Port of apps/accounts/sui.py.
//
// Sui does not sign the raw bytes: it prefixes an intent, BCS-encodes the
// message, hashes with blake2b-256, and signs that digest. We reproduce the
// digest, check the signature against the supplied public key, then confirm
// that key derives the claimed address. Skipping the last step would let anyone
// log in as anyone by pairing their own valid signature with another address.
//
// Ed25519 only; Secp256k1/r1 keys are rejected rather than mis-verified.

import { blake2b } from "@noble/hashes/blake2.js";

const SIGNATURE_SCHEME_ED25519 = 0x00;
const ED25519_SIGNATURE_LENGTH = 64;
const ED25519_PUBLIC_KEY_LENGTH = 32;
// IntentScope::PersonalMessage, IntentVersion::V0, AppId::Sui
const PERSONAL_MESSAGE_INTENT = [3, 0, 0];

export class SuiVerificationError extends Error {}

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
export async function verifyPersonalMessage(message: string, signatureB64: string, claimedAddress: string): Promise<string> {
  if (!signatureB64 || typeof signatureB64 !== "string") throw new SuiVerificationError("A wallet signature is required.");
  const raw = decodeBase64Strict(signatureB64);
  if (raw.length !== 1 + ED25519_SIGNATURE_LENGTH + ED25519_PUBLIC_KEY_LENGTH) {
    throw new SuiVerificationError("Unexpected signature length.");
  }
  if (raw[0] !== SIGNATURE_SCHEME_ED25519) throw new SuiVerificationError("Only Ed25519 wallet signatures are supported.");
  const signature = raw.slice(1, 1 + ED25519_SIGNATURE_LENGTH);
  const publicKey = raw.slice(1 + ED25519_SIGNATURE_LENGTH);
  const digest = personalMessageDigest(new TextEncoder().encode(message));

  let valid = false;
  try {
    // Native Ed25519 in workerd: far cheaper than a JS implementation.
    const key = await crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, ["verify"]);
    valid = await crypto.subtle.verify({ name: "Ed25519" }, key, signature, digest);
  } catch {
    throw new SuiVerificationError("Wallet public key is not valid.");
  }
  if (!valid) throw new SuiVerificationError("Wallet signature could not be verified.");

  const derived = addressFromPublicKey(publicKey);
  if (derived !== normalizeAddress(claimedAddress)) {
    throw new SuiVerificationError("Signature does not match the given Sui address.");
  }
  return derived;
}
