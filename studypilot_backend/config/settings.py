import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(ENV_PATH, override=False)


def env_list(name, default=""):
    value = os.getenv(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


def append_unique(values, *items):
    for item in items:
        if item and item not in values:
            values.append(item)
    return values


SECRET_KEY = os.getenv("SECRET_KEY", "unsafe-dev-key-change-me")
RENDER_EXTERNAL_HOSTNAME = os.getenv("RENDER_EXTERNAL_HOSTNAME", "").strip()
DEFAULT_DEBUG = "False" if RENDER_EXTERNAL_HOSTNAME else "True"
DEBUG = os.getenv("DEBUG", DEFAULT_DEBUG).lower() == "true"
if RENDER_EXTERNAL_HOSTNAME and os.getenv("ALLOW_RENDER_DEBUG", "False").lower() != "true":
    DEBUG = False
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,.onrender.com")
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "apps.accounts.apps.AccountsConfig",
    "apps.academics.apps.AcademicsConfig",
    "apps.documents.apps.DocumentsConfig",
    "apps.flashcards.apps.FlashcardsConfig",
    "apps.quizzes.apps.QuizzesConfig",
    "apps.resources.apps.ResourcesConfig",
    "apps.advisor.apps.AdvisorConfig",
    "apps.youtube_docx.apps.YoutubeDocxConfig",
    "apps.dashboard.apps.DashboardConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DATABASE_CONN_MAX_AGE = int(os.getenv("DATABASE_CONN_MAX_AGE", "0"))

if DATABASE_URL:
    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=DATABASE_CONN_MAX_AGE,
            conn_health_checks=DATABASE_CONN_MAX_AGE > 0,
            ssl_require=True,
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DATABASE_NAME", "studypilot_db"),
            "USER": os.getenv("DATABASE_USER", "postgres"),
            "PASSWORD": os.getenv("DATABASE_PASSWORD", ""),
            "HOST": os.getenv("DATABASE_HOST", "localhost"),
            "PORT": os.getenv("DATABASE_PORT", "5432"),
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "https://nowstudypilot.onrender.com,http://localhost:5173,http://127.0.0.1:5173")
append_unique(
    CORS_ALLOWED_ORIGINS,
    "https://nowstudypilot.onrender.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "https://nowstudypilot.onrender.com,https://studypilot-r710.onrender.com")
append_unique(
    CSRF_TRUSTED_ORIGINS,
    "https://nowstudypilot.onrender.com",
    "https://studypilot-r710.onrender.com",
)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", "60"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("JWT_REFRESH_TOKEN_LIFETIME_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "StudyPilot API",
    "DESCRIPTION": "Django REST Framework backend for StudyPilot academic advising and student success support.",
    "VERSION": "1.0.0",
}

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEEPSEEK_TIMEOUT_SECONDS = int(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "45"))
DEEPSEEK_KEY_LOADED = bool(DEEPSEEK_API_KEY.strip())
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "50"))
MAX_EXTRACTED_TEXT_CHARS = int(os.getenv("MAX_EXTRACTED_TEXT_CHARS", "80000"))
MAX_DEEPSEEK_CONTEXT_CHARS = int(os.getenv("MAX_DEEPSEEK_CONTEXT_CHARS", "20000"))
MAX_PDF_UPLOAD_MB = int(os.getenv("MAX_PDF_UPLOAD_MB", "50"))
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(MAX_PDF_UPLOAD_MB * 1024 * 1024)))
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv("DATA_UPLOAD_MAX_MEMORY_SIZE", str(MAX_UPLOAD_SIZE)))
FILE_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv("FILE_UPLOAD_MAX_MEMORY_SIZE", str(MAX_UPLOAD_SIZE)))
PDF_TEMP_DIR_VALUE = os.getenv("PDF_TEMP_DIR", "temp/pdfs")
if not DEBUG and not os.getenv("PDF_TEMP_DIR"):
    PDF_TEMP_DIR_VALUE = "/tmp/studypilot_pdfs"
PDF_TEMP_DIR = Path(PDF_TEMP_DIR_VALUE)
if not PDF_TEMP_DIR.is_absolute():
    PDF_TEMP_DIR = BASE_DIR / PDF_TEMP_DIR
MEDIA_URL = "/media/"
MEDIA_ROOT_VALUE = os.getenv("MEDIA_ROOT", str(PDF_TEMP_DIR))
MEDIA_ROOT = Path(MEDIA_ROOT_VALUE)
if not MEDIA_ROOT.is_absolute():
    MEDIA_ROOT = BASE_DIR / MEDIA_ROOT
FILE_UPLOAD_TEMP_DIR_VALUE = os.getenv("FILE_UPLOAD_TEMP_DIR", str(PDF_TEMP_DIR))
if not DEBUG and not os.getenv("FILE_UPLOAD_TEMP_DIR"):
    FILE_UPLOAD_TEMP_DIR_VALUE = str(PDF_TEMP_DIR)
FILE_UPLOAD_TEMP_DIR = Path(FILE_UPLOAD_TEMP_DIR_VALUE)
if not FILE_UPLOAD_TEMP_DIR.is_absolute():
    FILE_UPLOAD_TEMP_DIR = BASE_DIR / FILE_UPLOAD_TEMP_DIR
for writable_dir in (MEDIA_ROOT, PDF_TEMP_DIR, FILE_UPLOAD_TEMP_DIR):
    writable_dir.mkdir(parents=True, exist_ok=True)
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".docx", ".txt"}
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY", "")
OPENALEX_EMAIL = os.getenv("OPENALEX_EMAIL", "")
YOUTUBE_DOCX_TEMP_DIR_VALUE = os.getenv("YOUTUBE_DOCX_TEMP_DIR", "/tmp/youtube_docx" if RENDER_EXTERNAL_HOSTNAME else "temp/youtube_docx")
if not DEBUG and (not os.getenv("YOUTUBE_DOCX_TEMP_DIR") or (RENDER_EXTERNAL_HOSTNAME and not Path(YOUTUBE_DOCX_TEMP_DIR_VALUE).is_absolute())):
    YOUTUBE_DOCX_TEMP_DIR_VALUE = "/tmp/youtube_docx"
YOUTUBE_DOCX_TEMP_DIR = Path(YOUTUBE_DOCX_TEMP_DIR_VALUE)
if not YOUTUBE_DOCX_TEMP_DIR.is_absolute():
    YOUTUBE_DOCX_TEMP_DIR = BASE_DIR / YOUTUBE_DOCX_TEMP_DIR
YOUTUBE_DOCX_EXPIRY_MINUTES = int(os.getenv("YOUTUBE_DOCX_EXPIRY_MINUTES", "60"))
YOUTUBE_AUDIO_TEMP_DIR_VALUE = os.getenv("YOUTUBE_AUDIO_TEMP_DIR", "/tmp/youtube_audio" if RENDER_EXTERNAL_HOSTNAME else "temp/youtube_audio")
if not DEBUG and (not os.getenv("YOUTUBE_AUDIO_TEMP_DIR") or (RENDER_EXTERNAL_HOSTNAME and not Path(YOUTUBE_AUDIO_TEMP_DIR_VALUE).is_absolute())):
    YOUTUBE_AUDIO_TEMP_DIR_VALUE = "/tmp/youtube_audio"
YOUTUBE_AUDIO_TEMP_DIR = Path(YOUTUBE_AUDIO_TEMP_DIR_VALUE)
if not YOUTUBE_AUDIO_TEMP_DIR.is_absolute():
    YOUTUBE_AUDIO_TEMP_DIR = BASE_DIR / YOUTUBE_AUDIO_TEMP_DIR
ENABLE_AUDIO_TRANSCRIPTION = os.getenv("ENABLE_AUDIO_TRANSCRIPTION", "False").lower() == "true"
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")
