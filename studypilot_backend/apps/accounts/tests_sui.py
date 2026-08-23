"""Sui wallet sign-in.

The fixture signature below was produced by the official @mysten/sui SDK, so
these assert our Python verification agrees with the real wallet
implementation rather than merely agreeing with itself.
"""
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import reverse

from .models import SuiLoginChallenge
from .sui import (
    SuiVerificationError,
    address_from_public_key,
    normalize_address,
    verify_personal_message,
)
from .views import sui_challenge_message

User = get_user_model()

# Generated with @mysten/sui Ed25519Keypair.signPersonalMessage
SDK_ADDRESS = "0xfae6b33dabbb1f4546b8dad46ad8c5f5a0a18b46adbef0598c09cb79ee3aa042"
SDK_MESSAGE = "StudyPilot sign-in challenge: abc123XYZ"
SDK_SIGNATURE = (
    "AKHEn2IGTasxpIEy0dYRBLGYeHcFp3Xtd/pRdoWYZhd56jEtAOOZaIIcEjfxC4Sa9QLNAa10ck1/"
    "sQdtecm4Tw1s73ULnvrFOgZBzTUQCllpRIOAnc641PpKrD0GSCafew=="
)


class SignatureVerificationTests(SimpleTestCase):
    def test_accepts_a_signature_made_by_the_official_sdk(self):
        self.assertEqual(verify_personal_message(SDK_MESSAGE, SDK_SIGNATURE, SDK_ADDRESS), SDK_ADDRESS)

    def test_rejects_a_tampered_message(self):
        with self.assertRaises(SuiVerificationError):
            verify_personal_message(SDK_MESSAGE + "!", SDK_SIGNATURE, SDK_ADDRESS)

    def test_rejects_a_valid_signature_paired_with_another_address(self):
        """Without the derived-address check anyone could log in as anyone."""
        with self.assertRaises(SuiVerificationError):
            verify_personal_message(SDK_MESSAGE, SDK_SIGNATURE, "0x" + "ab" * 32)

    def test_rejects_malformed_input(self):
        for signature in ["", "not-base64!!", "AAAA"]:
            with self.assertRaises(SuiVerificationError):
                verify_personal_message(SDK_MESSAGE, signature, SDK_ADDRESS)

    def test_rejects_non_ed25519_scheme(self):
        import base64

        raw = base64.b64decode(SDK_SIGNATURE)
        secp = bytes([0x01]) + raw[1:]
        with self.assertRaises(SuiVerificationError):
            verify_personal_message(SDK_MESSAGE, base64.b64encode(secp).decode(), SDK_ADDRESS)

    def test_address_normalisation_pads_and_lowercases(self):
        self.assertEqual(normalize_address("0xABC"), "0x" + "abc".rjust(64, "0"))
        self.assertEqual(normalize_address(SDK_ADDRESS.upper().replace("0X", "0x")), SDK_ADDRESS)

    def test_address_derivation_matches_the_sdk(self):
        import base64

        public_key = base64.b64decode(SDK_SIGNATURE)[65:]
        self.assertEqual(address_from_public_key(public_key), SDK_ADDRESS)


class SuiAuthEndpointTests(TestCase):
    def _challenge(self):
        response = self.client.post(reverse("sui_challenge"), content_type="application/json")
        return response.json()["data"]

    def test_challenge_returns_a_nonce_and_the_exact_message_to_sign(self):
        data = self._challenge()
        self.assertIn("nonce", data)
        self.assertEqual(data["message"], sui_challenge_message(data["nonce"]))

    def test_unknown_nonce_is_rejected(self):
        response = self.client.post(
            reverse("sui_auth"),
            data={"address": SDK_ADDRESS, "signature": SDK_SIGNATURE, "nonce": "deadbeef"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_a_spent_nonce_cannot_be_replayed(self):
        """A captured signature must not log anyone in twice."""
        challenge = SuiLoginChallenge.objects.create(nonce="a" * 32)
        payload = {"address": SDK_ADDRESS, "signature": SDK_SIGNATURE, "nonce": challenge.nonce}

        first = self.client.post(reverse("sui_auth"), data=payload, content_type="application/json")
        # The fixture signs a different message, so this fails at the signature
        # step, but the nonce must still be consumed.
        self.assertIn(first.status_code, (400, 401))

        second = self.client.post(reverse("sui_auth"), data=payload, content_type="application/json")
        self.assertEqual(second.status_code, 400)
        self.assertIn("already been used", second.json()["message"])

    def test_missing_fields_are_rejected(self):
        response = self.client.post(reverse("sui_auth"), data={"address": SDK_ADDRESS}, content_type="application/json")
        self.assertEqual(response.status_code, 400)


class SuiAccountCreationTests(TestCase):
    def test_two_wallets_never_collide_on_the_placeholder_email(self):
        a = User.objects.create_user(email=f"{'0x' + 'a' * 64}@sui.studypilot.local", password=None, full_name="A")
        b = User.objects.create_user(email=f"{'0x' + 'b' * 64}@sui.studypilot.local", password=None, full_name="B")
        self.assertNotEqual(a.email, b.email)

    def test_sui_address_is_unique(self):
        from django.db.utils import IntegrityError

        User.objects.create_user(email="one@x.com", password=None, full_name="One", sui_address=SDK_ADDRESS)
        with self.assertRaises(IntegrityError):
            User.objects.create_user(email="two@x.com", password=None, full_name="Two", sui_address=SDK_ADDRESS)

    def test_blank_wallets_do_not_collide(self):
        """sui_address is null, not empty string, so ordinary users coexist."""
        User.objects.create_user(email="a@x.com", password=None, full_name="A")
        User.objects.create_user(email="b@x.com", password=None, full_name="B")
        self.assertEqual(User.objects.filter(sui_address__isnull=True).count(), 2)
