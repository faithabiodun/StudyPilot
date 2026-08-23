from django.urls import path

from .views import (
    CompleteOnboardingView,
    DeleteAccountView,
    GoogleAuthView,
    LoginView,
    LogoutView,
    MeView,
    ProfileView,
    RegisterView,
    SetUsernameView,
    SuiAuthView,
    SuiChallengeView,
    UsernameAvailableView,
    SupabaseGoogleAuthView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("google/", GoogleAuthView.as_view(), name="google_auth"),
    path("supabase-google/", SupabaseGoogleAuthView.as_view(), name="supabase_google_auth"),
    path("sui/challenge/", SuiChallengeView.as_view(), name="sui_challenge"),
    path("sui/", SuiAuthView.as_view(), name="sui_auth"),
    path("username/", SetUsernameView.as_view(), name="set_username"),
    path("username/available/", UsernameAvailableView.as_view(), name="username_available"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("delete-account/", DeleteAccountView.as_view(), name="delete_account"),
    path("complete-onboarding/", CompleteOnboardingView.as_view(), name="complete_onboarding"),
]
