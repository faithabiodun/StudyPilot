from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenRefreshView
from apps.dashboard.views import HeartbeatView

def root_status(request):
    return JsonResponse(
        {
            "success": True,
            "message": "StudyPilot backend is running",
            "api_docs": "/api/docs/",
        }
    )


class HealthCheckView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return JsonResponse(
            {
                "success": True,
                "message": "StudyPilot backend is running",
                "api_docs": "/api/docs/",
            }
        )


urlpatterns = [
    path("", root_status, name="root_status"),
    path("admin/", admin.site.urls),
    path("api/health/", HealthCheckView.as_view(), name="api_health"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/academics/", include("apps.academics.urls")),
    path("api/documents/", include("apps.documents.urls")),
    path("api/flashcards/", include("apps.flashcards.urls")),
    path("api/quizzes/", include("apps.quizzes.urls")),
    path("api/resources/", include("apps.resources.urls")),
    path("api/advisor/", include("apps.advisor.urls")),
    path("api/youtube-docx/", include("apps.youtube_docx.urls")),
    path("api/dashboard/", include("apps.dashboard.urls")),
    path("api/activity/heartbeat/", HeartbeatView.as_view(), name="activity_heartbeat"),
    path("api/admin/", include("apps.dashboard.admin_urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
