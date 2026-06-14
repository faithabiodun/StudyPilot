from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path
import importlib.util
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


class DeploymentHealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        database_connected = False
        pymupdf_available = False
        pdfplumber_available = False
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                database_connected = cursor.fetchone()[0] == 1
        except Exception:
            database_connected = False

        try:
            pymupdf_available = importlib.util.find_spec("fitz") is not None
        except Exception:
            pymupdf_available = False

        try:
            pdfplumber_available = importlib.util.find_spec("pdfplumber") is not None
        except Exception:
            pdfplumber_available = False

        try:
            pdf_temp_dir_exists = settings.PDF_TEMP_DIR.exists()
        except Exception:
            pdf_temp_dir_exists = False

        try:
            cors_frontend_allowed = "https://nowstudypilot.onrender.com" in settings.CORS_ALLOWED_ORIGINS
        except Exception:
            cors_frontend_allowed = False

        return JsonResponse(
            {
                "success": True,
                "backend": "running",
                "debug": settings.DEBUG,
                "database": "connected" if database_connected else "unavailable",
                "deepseek_configured": bool(settings.DEEPSEEK_API_KEY),
                "pdf_temp_dir": str(settings.PDF_TEMP_DIR),
                "pdf_temp_dir_exists": pdf_temp_dir_exists,
                "upload_limit_mb": settings.MAX_UPLOAD_SIZE // (1024 * 1024),
                "pymupdf_available": pymupdf_available,
                "pdfplumber_available": pdfplumber_available,
                "cors_frontend_allowed": cors_frontend_allowed,
            }
        )


urlpatterns = [
    path("", root_status, name="root_status"),
    path("admin/", admin.site.urls),
    path("api/health/", HealthCheckView.as_view(), name="api_health"),
    path("api/health/deployment/", DeploymentHealthView.as_view(), name="api_deployment_health"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/academics/", include("apps.academics.urls")),
    path("api/documents/", include("apps.documents.urls")),
    path("api/flashcards/", include("apps.flashcards.urls")),
    path("api/quizzes/", include("apps.quizzes.urls")),
    path("api/youtube/", include("apps.youtube_docx.urls")),
    path("api/resources/", include("apps.resources.urls")),
    path("api/advisor/", include("apps.advisor.urls")),
    path("api/dashboard/", include("apps.dashboard.urls")),
    path("api/activity/heartbeat/", HeartbeatView.as_view(), name="activity_heartbeat"),
    path("api/admin/", include("apps.dashboard.admin_urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
