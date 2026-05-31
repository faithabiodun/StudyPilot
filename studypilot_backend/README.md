# StudyPilot Backend

Django REST Framework backend for StudyPilot.

## Stack

- Django
- Django REST Framework
- PostgreSQL
- Simple JWT
- Google OAuth ID token verification with `google-auth`
- DeepSeek V4 Flash through the compatible chat-completions SDK
- PyMuPDF and pdfplumber for PDF text extraction
- YouTube Data API, Google Books API, and OpenAlex for Resource Hub
- drf-spectacular for API docs

## Project Structure

```text
studypilot_backend/
  manage.py
  requirements.txt
  .env.example
  config/
  apps/
    accounts/
    academics/
    documents/
    flashcards/
    quizzes/
    resources/
    advisor/
    dashboard/
```

## Environment Setup

Create `.env` from `.env.example` and configure:

```env
SECRET_KEY=change-me
DEBUG=True
DATABASE_URL=
DATABASE_CONN_MAX_AGE=0
DATABASE_NAME=studypilot_db
DATABASE_USER=postgres
DATABASE_PASSWORD=
DATABASE_HOST=localhost
DATABASE_PORT=5432
ALLOWED_HOSTS=studypilot-r710.onrender.com,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://nowstudypilot.onrender.com,http://localhost:5173,http://127.0.0.1:5173
CSRF_TRUSTED_ORIGINS=https://nowstudypilot.onrender.com,https://studypilot-r710.onrender.com
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_SECONDS=45
MAX_DEEPSEEK_CONTEXT_CHARS=20000
YOUTUBE_API_KEY=your_youtube_api_key_here
GOOGLE_BOOKS_API_KEY=your_google_books_api_key_here
OPENALEX_EMAIL=your_email_optional
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7
```

## Install and Run

```powershell
cd "C:\Users\User\Documents\New project\studypilot-project\studypilot_backend"
python -m pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py runserver
```

## Core APIs

- `POST /api/auth/register/`
- `POST /api/auth/login/`
- `POST /api/auth/supabase-google/`
- `GET /api/dashboard/summary/`
- `POST /api/documents/upload/`
- `POST /api/flashcards/generate/`
- `POST /api/quizzes/generate/`
- `POST /api/quizzes/generate-mcq/`
- `GET /api/resources/recommendations/`
- `POST /api/advisor/chat/`
- `PATCH /api/auth/profile/`
- `DELETE /api/auth/delete-account/`

## Render Deployment

- Runtime: Python
- Root directory: `studypilot_backend`
- Build command: `pip install -r requirements.txt`
- Start command: `python manage.py migrate && gunicorn config.wsgi:application --timeout 180 --workers 1`
- Health check path: `/api/health/`

Recommended production variables:

```env
SECRET_KEY=your_production_secret_key
DEBUG=False
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
ALLOWED_HOSTS=studypilot-r710.onrender.com,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://nowstudypilot.onrender.com,http://localhost:5173,http://127.0.0.1:5173
CSRF_TRUSTED_ORIGINS=https://nowstudypilot.onrender.com,https://studypilot-r710.onrender.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
YOUTUBE_API_KEY=your_youtube_api_key_here
GOOGLE_BOOKS_API_KEY=your_google_books_api_key_here
OPENALEX_EMAIL=your_email_optional
PDF_TEMP_DIR=/tmp/studypilot_pdfs
MEDIA_ROOT=/tmp/studypilot_pdfs
FILE_UPLOAD_TEMP_DIR=/tmp/studypilot_pdfs
DATA_UPLOAD_MAX_MEMORY_SIZE=52428800
FILE_UPLOAD_MAX_MEMORY_SIZE=52428800
MAX_PDF_UPLOAD_MB=50
```

## Checks

```powershell
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

Deployment diagnostics:

- `GET /api/health/`
- `GET /api/health/deployment/`
