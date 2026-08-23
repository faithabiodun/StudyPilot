"""Verify Sui wallet personal-message signatures.

A wallet proves ownership of an address by signing a challenge with
`signPersonalMessage`. Sui does not sign the raw bytes: it prefixes an intent,
BCS-encodes the message, hashes with blake2b-256, and signs that digest. To
accept a login we have to reproduce exactly the same digest, check the
signature against the supplied public key, and then confirm that public key
actually derives the address the client claims. Skipping that last step would
let anyone log in as anyone by sending their own valid signature alongside
someone else's address.

Ed25519 only. Sui also allows Secp256k1 and Secp256r1 keys, which are rejected
here rather than silently mis-verified.
"""
import base64
import hashlib
import re

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

SIGNATURE_SCHEME_ED25519 = 0x00
ED25519_SIGNATURE_LENGTH = 64
ED25519_PUBLIC_KEY_LENGTH = 32
# IntentScope::PersonalMessage, IntentVersion::V0, AppId::Sui
PERSONAL_MESSAGE_INTENT = bytes([3, 0, 0])
SUI_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")


class SuiVerificationError(Exception):
    pass


def _uleb128(value):
    """BCS encodes a vector length as ULEB128."""
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def normalize_address(address):
    """Lowercase and zero-pad to the canonical 32-byte hex form."""
    if not address or not isinstance(address, str):
        raise SuiVerificationError("A Sui address is required.")
    value = address.strip().lower()
    if not value.startswith("0x"):
        raise SuiVerificationError("Sui address must start with 0x.")
    body = value[2:]
    if not body or len(body) > 64 or not all(c in "0123456789abcdef" for c in body):
        raise SuiVerificationError("Sui address is not valid hex.")
    return "0x" + body.rjust(64, "0")


def address_from_public_key(public_key_bytes, scheme=SIGNATURE_SCHEME_ED25519):
    """Sui address = blake2b-256(flag || public_key)."""
    digest = hashlib.blake2b(bytes([scheme]) + public_key_bytes, digest_size=32).digest()
    return "0x" + digest.hex()


def personal_message_digest(message_bytes):
    """The digest a Sui wallet actually signs for a personal message."""
    bcs_message = _uleb128(len(message_bytes)) + message_bytes
    return hashlib.blake2b(PERSONAL_MESSAGE_INTENT + bcs_message, digest_size=32).digest()


def verify_personal_message(message, signature_b64, claimed_address):
    """Return the verified Sui address, or raise SuiVerificationError.

    `signature_b64` is the wallet's serialized signature:
    flag(1) || signature(64) || public_key(32), base64 encoded.
    """
    if not signature_b64 or not isinstance(signature_b64, str):
        raise SuiVerificationError("A wallet signature is required.")

    try:
        raw = base64.b64decode(signature_b64, validate=True)
    except Exception as exc:
        raise SuiVerificationError("Signature is not valid base64.") from exc

    expected = 1 + ED25519_SIGNATURE_LENGTH + ED25519_PUBLIC_KEY_LENGTH
    if len(raw) != expected:
        raise SuiVerificationError("Unexpected signature length.")

    scheme = raw[0]
    if scheme != SIGNATURE_SCHEME_ED25519:
        raise SuiVerificationError("Only Ed25519 wallet signatures are supported.")

    signature = raw[1 : 1 + ED25519_SIGNATURE_LENGTH]
    public_key_bytes = raw[1 + ED25519_SIGNATURE_LENGTH :]

    digest = personal_message_digest(message.encode("utf-8") if isinstance(message, str) else message)
    try:
        Ed25519PublicKey.from_public_bytes(public_key_bytes).verify(signature, digest)
    except InvalidSignature as exc:
        raise SuiVerificationError("Wallet signature could not be verified.") from exc
    except Exception as exc:
        raise SuiVerificationError("Wallet public key is not valid.") from exc

    derived = address_from_public_key(public_key_bytes, scheme)
    # The signature alone only proves control of *some* key. Without this the
    # caller could pair a real signature with somebody else's address.
    if derived != normalize_address(claimed_address):
        raise SuiVerificationError("Signature does not match the given Sui address.")
    return derived
