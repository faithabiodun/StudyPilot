from django.urls import path

from .views import CompleteOnboardingView, GoogleAuthView, LoginView, LogoutView, MeView, ProfileView, RegisterView, SupabaseGoogleAuthView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("google/", GoogleAuthView.as_view(), name="google_auth"),
    path("supabase-google/", SupabaseGoogleAuthView.as_view(), name="supabase_google_auth"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("complete-onboarding/", CompleteOnboardingView.as_view(), name="complete_onboarding"),
]
