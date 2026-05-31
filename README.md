# StudyPilot

StudyPilot is a student academic workspace with a React Vite frontend and a Django REST Framework backend. It supports Django JWT authentication, Supabase Google OAuth, Academic Passport onboarding, PDF Study Converter, Resource Hub, AI Advisor, dashboard activity tracking, profile management, and account deletion.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, React Router, Recharts
- Backend: Django, Django REST Framework, Simple JWT, drf-spectacular
- Database: Supabase PostgreSQL through `DATABASE_URL`
- OAuth: Supabase Google OAuth, exchanged for Django JWT
- AI provider: DeepSeek V4 Flash through an OpenAI-compatible backend client
- PDF processing: PyMuPDF and pdfplumber
- Resource Hub: YouTube Data API, Google Books API, OpenAlex

## Repository Structure

```text
studypilot/
  React Vite frontend

studypilot_backend/
  Django REST Framework backend
```

## Frontend Setup

```powershell
cd studypilot
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend environment variables:

```env
VITE_API_BASE_URL=https://studypilot-r710.onrender.com/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Backend Setup

```powershell
cd studypilot_backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py runserver
```

Backend environment variables:

```env
SECRET_KEY=change-me
DEBUG=True
ALLOWED_HOSTS=studypilot-r710.onrender.com,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://nowstudypilot.onrender.com,http://localhost:5173,http://127.0.0.1:5173
CSRF_TRUSTED_ORIGINS=https://nowstudypilot.onrender.com,https://studypilot-r710.onrender.com
DATABASE_URL=
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
YOUTUBE_API_KEY=your_youtube_api_key_here
GOOGLE_BOOKS_API_KEY=your_google_books_api_key_here
OPENALEX_EMAIL=your_email_optional
```

## Main Features

- Student authentication
- Academic Passport
- Dashboard
- PDF Study Converter
- Resource Hub
- AI Advisor
- Profile management
- Delete account

## Storage Rules

Uploaded PDFs are temporary. The backend extracts text, deletes the physical PDF, and stores only document metadata and extracted text. Do not use Supabase Storage for uploaded PDFs.

## Render Deployment

Frontend:
- Deploy `studypilot/` as a static site
- Build command: `npm run build`
- Publish directory: `dist`

Backend:
- Deploy `studypilot_backend/` as a Render web service
- Build command: `pip install -r requirements.txt`
- Start command: `python manage.py migrate && gunicorn config.wsgi:application --timeout 180 --workers 1`
- Health check path: `/api/health/`

Recommended backend environment variables:

```env
SECRET_KEY=your_production_secret_key
DEBUG=False
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
ALLOWED_HOSTS=studypilot-r710.onrender.com,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://nowstudypilot.onrender.com,http://localhost:5173,http://127.0.0.1:5173
CSRF_TRUSTED_ORIGINS=https://nowstudypilot.onrender.com,https://studypilot-r710.onrender.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
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

Frontend:

```powershell
cd studypilot
npm run build
```

Backend:

```powershell
cd studypilot_backend
.\venv\Scripts\python.exe manage.py check
```

Live deployment diagnostics:

- `https://studypilot-r710.onrender.com/api/health/`
- `https://studypilot-r710.onrender.com/api/health/deployment/`
