from datetime import timedelta
import secrets

from django.conf import settings
from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
import requests
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.dashboard.services import record_activity, record_login
from apps.utils import error_response, success_response

from .models import SuiLoginChallenge
from .serializers import (
    GoogleAuthSerializer,
    LoginSerializer,
    OnboardingSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    SuiAuthSerializer,
    SupabaseGoogleAuthSerializer,
    UserSerializer,
)
from .sui import SuiVerificationError, verify_personal_message

User = get_user_model()

SUI_CHALLENGE_TTL_SECONDS = 300


def sui_challenge_message(nonce):
    """The exact text the wallet signs. Must match on both sides byte for byte."""
    return (
        "Sign in to StudyPilot\n\n"
        "This signature proves you own this wallet. "
        "It is free and does not create a transaction.\n\n"
        f"Nonce: {nonce}"
    )


def tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def auth_payload(user):
    tokens = tokens_for_user(user)
    return {**tokens, "user": UserSerializer(user).data}


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Registration failed", serializer.errors)
        user = serializer.save()
        return success_response("Registration successful", auth_payload(user), status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Invalid login payload", serializer.errors)

        email = serializer.validated_data["email"].lower()
        password = serializer.validated_data["password"]
        user = User.objects.filter(email__iexact=email).first()
        if not user or not user.check_password(password):
            return error_response("Invalid login credentials", status_code=status.HTTP_401_UNAUTHORIZED)
        if not user.is_active:
            return error_response("User account is disabled", status_code=status.HTTP_403_FORBIDDEN)

        record_login(user)
        return success_response("Login successful", auth_payload(user))


class GoogleAuthView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Google token invalid", serializer.errors)

        token = serializer.validated_data.get("credential") or serializer.validated_data.get("id_token")
        if not settings.GOOGLE_CLIENT_ID:
            return error_response("GOOGLE_CLIENT_ID is not configured", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            payload = id_token.verify_oauth2_token(token, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
        except ValueError:
            return error_response("Google token invalid", status_code=status.HTTP_401_UNAUTHORIZED)

        email = payload.get("email")
        google_id = payload.get("sub")
        if not email or not google_id:
            return error_response("Google token missing required profile data", status_code=status.HTTP_400_BAD_REQUEST)

        user, created = User.objects.get_or_create(
            email=email.lower(),
            defaults={
                "full_name": payload.get("name") or email.split("@")[0],
                "avatar": payload.get("picture", ""),
                "google_id": google_id,
                "is_google_account": True,
                "role": User.Role.STUDENT,
            },
        )
        if not created:
            user.google_id = user.google_id or google_id
            user.avatar = payload.get("picture", user.avatar)
            user.is_google_account = True
            user.save(update_fields=["google_id", "avatar", "is_google_account", "updated_at"])

        record_login(user)
        return success_response("Google login successful", auth_payload(user))


class SupabaseGoogleAuthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SupabaseGoogleAuthSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Supabase access token is required", serializer.errors)

        if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
            return error_response(
                "Supabase Auth is not configured",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        access_token = serializer.validated_data["access_token"]
        try:
            response = requests.get(
                f"{settings.SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "apikey": settings.SUPABASE_ANON_KEY,
                },
                timeout=10,
            )
        except requests.RequestException:
            return error_response("Unable to verify Supabase user", status_code=status.HTTP_503_SERVICE_UNAVAILABLE)

        if response.status_code != 200:
            return error_response("Invalid Supabase session token.", status_code=status.HTTP_401_UNAUTHORIZED)

        payload = response.json()
        email = (payload.get("email") or "").lower()
        supabase_user_id = payload.get("id", "")
        metadata = payload.get("user_metadata") or {}
        full_name = (
            metadata.get("full_name")
            or metadata.get("name")
            or metadata.get("display_name")
            or (email.split("@")[0] if email else "")
        )
        avatar = metadata.get("avatar_url") or metadata.get("picture") or ""

        if not email or not supabase_user_id:
            return error_response("Supabase user is missing required profile data", status_code=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email).first()
        if not user:
            user = User.objects.create_user(
                email=email,
                password=None,
                full_name=full_name,
                avatar=avatar,
                supabase_user_id=supabase_user_id,
                is_google_account=True,
                role=User.Role.STUDENT,
            )
        else:
            update_fields = ["updated_at"]
            if not user.full_name and full_name:
                user.full_name = full_name
                update_fields.append("full_name")
            if avatar and user.avatar != avatar:
                user.avatar = avatar
                update_fields.append("avatar")
            if user.supabase_user_id != supabase_user_id:
                user.supabase_user_id = supabase_user_id
                update_fields.append("supabase_user_id")
            if not user.is_google_account:
                user.is_google_account = True
                update_fields.append("is_google_account")
            user.save(update_fields=update_fields)

        record_login(user)
        return success_response("Google login successful", auth_payload(user))


class SuiChallengeView(APIView):
    """Issue a one-time nonce for a wallet to sign."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        # Opportunistically drop expired rows so the table cannot grow forever.
        cutoff = timezone.now() - timedelta(seconds=SUI_CHALLENGE_TTL_SECONDS * 4)
        SuiLoginChallenge.objects.filter(created_at__lt=cutoff).delete()

        challenge = SuiLoginChallenge.objects.create(nonce=secrets.token_hex(16))
        return success_response("Sui challenge issued", {
            "nonce": challenge.nonce,
            "message": sui_challenge_message(challenge.nonce),
            "expires_in": SUI_CHALLENGE_TTL_SECONDS,
        })


class SuiAuthView(APIView):
    """Log a wallet in by verifying its signature over our nonce."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SuiAuthSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Sui login failed", serializer.errors)

        nonce = serializer.validated_data["nonce"]
        address = serializer.validated_data["address"]
        signature = serializer.validated_data["signature"]

        # Claim the nonce atomically so two concurrent requests cannot spend the
        # same challenge, and so a captured signature cannot be replayed.
        with transaction.atomic():
            challenge = (
                SuiLoginChallenge.objects.select_for_update()
                .filter(nonce=nonce, used_at__isnull=True)
                .first()
            )
            if not challenge:
                return error_response("This sign-in request has already been used. Please try again.", status_code=status.HTTP_400_BAD_REQUEST)
            if timezone.now() - challenge.created_at > timedelta(seconds=SUI_CHALLENGE_TTL_SECONDS):
                challenge.delete()
                return error_response("This sign-in request expired. Please try again.", status_code=status.HTTP_400_BAD_REQUEST)
            challenge.used_at = timezone.now()
            challenge.save(update_fields=["used_at"])

        try:
            verified_address = verify_personal_message(sui_challenge_message(nonce), signature, address)
        except SuiVerificationError as exc:
            return error_response(str(exc), status_code=status.HTTP_401_UNAUTHORIZED)

        user = User.objects.filter(sui_address=verified_address).first()
        created = False
        if not user:
            # A wallet carries no email or name, so stand in placeholders and let
            # the existing Academic Passport onboarding collect the real details.
            short = f"{verified_address[:6]}...{verified_address[-4:]}"
            user = User.objects.create_user(
                email=f"{verified_address}@sui.studypilot.local",
                password=None,
                full_name=f"Sui Wallet {short}",
                role=User.Role.STUDENT,
            )
            user.sui_address = verified_address
            user.save(update_fields=["sui_address", "updated_at"])
            created = True

        record_login(user)
        payload = auth_payload(user)
        payload["created"] = created
        payload["sui_address"] = verified_address
        return success_response("Sui login successful", payload)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return error_response("Refresh token is required")
        try:
            RefreshToken(refresh_token).blacklist()
        except Exception:
            return error_response("Invalid refresh token", status_code=status.HTTP_400_BAD_REQUEST)
        return success_response("Logout successful")


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_response("Current user fetched", UserSerializer(request.user).data)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        before_courses = request.user.current_courses or []
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        if not serializer.is_valid():
            return error_response("Profile update failed", serializer.errors)
        user = serializer.save()
        after_courses = user.current_courses or []

        def course_key(course):
            if isinstance(course, dict):
                return (course.get("code") or course.get("title") or "").strip().lower()
            return str(course).strip().lower()

        before_keys = {course_key(course): course for course in before_courses if course_key(course)}
        after_keys = {course_key(course): course for course in after_courses if course_key(course)}
        for key, course in after_keys.items():
            if key not in before_keys:
                label = course.get("title") if isinstance(course, dict) else str(course)
                record_activity(user, "course_added", "Added Course", f"You added {label} to your Academic Passport.", {"course": course})
        for key, course in before_keys.items():
            if key not in after_keys:
                label = course.get("title") if isinstance(course, dict) else str(course)
                record_activity(user, "course_deleted", "Deleted Course", f"You removed {label} from your Academic Passport.", {"course": course})
        if not request.data.get("current_courses"):
            record_activity(user, "profile_updated", "Updated Profile", "You updated your Academic Passport.")
        return success_response("Profile updated", UserSerializer(request.user).data)


class DeleteAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        user = request.user
        with transaction.atomic():
            try:
                Document = apps.get_model("documents", "Document")
                for document in Document.objects.filter(user=user).exclude(file=""):
                    if document.file:
                        document.file.delete(save=False)
            except LookupError:
                pass

            for app_label, model_name, field_name in (
                ("advisor", "ChatSession", "user"),
                ("dashboard", "ActivityLog", "user"),
                ("dashboard", "LoginActivity", "user"),
                ("dashboard", "UserSessionActivity", "user"),
                ("documents", "DocumentChunk", "user"),
                ("documents", "Document", "user"),
                ("flashcards", "FlashcardDeck", "user"),
                ("quizzes", "Quiz", "user"),
                ("resources", "SavedResource", "user"),
            ):
                try:
                    model = apps.get_model(app_label, model_name)
                except LookupError:
                    continue
                model.objects.filter(**{field_name: user}).delete()

            user.delete()
        return success_response("Account deleted successfully.")


class CompleteOnboardingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = OnboardingSerializer(request.user, data=request.data, partial=True)
        if not serializer.is_valid():
            return error_response("Academic Passport setup failed", serializer.errors)
        user = serializer.save()
        return success_response("Academic Passport completed", UserSerializer(user).data)
