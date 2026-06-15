# StudyPilot: An AI study workspace for students

StudyPilot is a student academic workspace with a React Vite frontend and a
Django REST Framework backend. It turns your study materials, PDFs and YouTube
lectures, into flashcards, quizzes, and Word study notes, and it ships an AI
Advisor, a Resource Hub, Academic Passport onboarding, and full account and
profile management on top of Django JWT auth and Supabase Google OAuth.

- **Live app:** https://nowstudypilot.onrender.com
- **Backend API:** https://studypilot-r710.onrender.com/api
- **Health check:** https://studypilot-r710.onrender.com/api/health/

## What is StudyPilot?

- **A study workspace, not just a converter.** One clean dashboard ties together
  your courses, generated outputs, recent activity, and a 7 day study time chart.
- **PDF to study material.** Upload one PDF, the backend extracts the text and
  generates flashcards, MCQs, or a mixed quiz from it.
- **YouTube to study material.** Paste a lecture link and get a downloadable Word
  document, flashcards, an MCQ quiz, or a mixed quiz. No video is ever downloaded,
  only the transcript and metadata are used.
- **Reliable by design.** The YouTube transcript is resolved through multiple
  sources with fallbacks, so a single failing source does not break a request,
  and generation retries when the first pass returns too few items.
- **AI Advisor.** Ask academic questions and get guidance grounded in your course
  and policy context, powered by DeepSeek through an OpenAI compatible client.
- **Resource Hub.** Discover videos, textbooks, and academic articles from the
  YouTube Data API, Google Books, and OpenAlex.
- **Secure auth.** Django JWT with transparent token refresh, plus Supabase Google
  OAuth exchanged for a Django JWT.
- **Built for free hosting.** The frontend survives Render cold starts by pinging
  the backend on load and retrying connection level failures, so features keep
  reaching the API even after the backend has been idle.

## Stacks

### Frontend

| Tool | Version | Role |
| --- | --- | --- |
| React | ^19.0.0 | UI library |
| Vite | ^6.0.7 | Build tool and dev server |
| Tailwind CSS | ^3.4.17 | Styling |
| React Router | ^7.1.1 | Routing |
| Recharts | ^3.8.1 | Dashboard charts |
| @supabase/supabase-js | ^2.105.4 | Supabase Google OAuth client |
| lucide-react | ^0.468.0 | Icons |
| PostCSS and Autoprefixer | ^8.4.49 and ^10.4.20 | CSS pipeline |

### Backend

| Tool | Version | Role |
| --- | --- | --- |
| Django | 6.0.5 | Web framework |
| Django REST Framework | 3.17.1 | REST API |
| djangorestframework-simplejwt | 5.5.1 | JWT auth |
| drf-spectacular | 0.29.0 | OpenAPI schema and docs |
| dj-database-url | 3.1.2 | `DATABASE_URL` parsing |
| psycopg2-binary | 2.9.12 | PostgreSQL driver |
| openai | 2.37.0 | OpenAI compatible client (DeepSeek) |
| PyMuPDF and pdfplumber | 1.27.2.3 and 0.11.9 | PDF text extraction |
| python-docx | 1.1.2 | Word (DOCX) generation |
| youtube-transcript-api | 0.6.2 | YouTube transcript fetching |
| requests | 2.32.5 | HTTP (timedtext and metadata fallbacks) |
| gunicorn and whitenoise | 26.0.0 and 6.12.0 | Production server and static files |
| Pillow | 12.0.0 | Image support |

### Platform

- **Database:** Supabase PostgreSQL through `DATABASE_URL`
- **OAuth:** Supabase Google OAuth, exchanged for a Django JWT
- **AI provider:** DeepSeek V4 Flash through the OpenAI compatible client
- **Resource Hub:** YouTube Data API, Google Books API, OpenAlex
- **Hosting:** Render (frontend static site and backend web service)

## Features at a glance

| Feature | Route | What it does |
| --- | --- | --- |
| Dashboard | `/student/dashboard` | Stats, quick actions, 7 day study chart, recent activity, recommendations. |
| PDF Study Converter | `/student/pdf-studio` | Upload one PDF and generate flashcards, MCQs, or a mixed quiz. |
| YouTube Converter | `/student/youtube-to-docx` | Turn a lecture link into a DOCX, flashcards, an MCQ quiz, or a mixed quiz. |
| Resource Hub | `/student/resource-hub` | Find videos, textbooks, and articles for your courses. |
| AI Advisor | `/student/ai-advisor` | Ask academic questions grounded in course and policy context. |
| Academic Passport | `/onboarding` | Capture courses, goals, weak areas, and learning preferences. |
| Profile | `/student/profile` | Manage your account and delete it. |

## Quick Start

### 1. Frontend

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

### 2. Backend

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

> `YOUTUBE_API_KEY` is optional for the YouTube Converter. Transcripts work
> without it, but it enriches the DOCX with the real video title and channel.

### 3. Verify it runs

```powershell
cd studypilot
npm run build
```

```powershell
cd studypilot_backend
.\venv\Scripts\python.exe manage.py check
```

## API Endpoints (YouTube Converter)

All require a valid JWT (`Authorization: Bearer <token>`).

| Method | Path | Returns |
| --- | --- | --- |
| `POST` | `/api/youtube/docx/` | Streams a `.docx` study document |
| `POST` | `/api/youtube/flashcards/` | `{ cards: [...] }` |
| `POST` | `/api/youtube/mcq/` | `{ questions: [...] }` |
| `POST` | `/api/youtube/quiz/` | `{ questions: [...] }` |

## Storage Rules

Uploaded PDFs are temporary. The backend extracts the text, deletes the physical
PDF, and stores only document metadata and extracted text. YouTube videos are
never downloaded, only the transcript and metadata are used. Do not use Supabase
Storage for uploaded PDFs.

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

## What's included

```
studypilot/
  React Vite frontend (pages, components, services, dashboard charts)
studypilot_backend/
  Django REST Framework backend
  apps/dashboard/      summary, 7 day study time, activity heartbeat
  apps/youtube_docx/   YouTube to DOCX, flashcards, MCQ, mixed quiz
```

## Live diagnostics

- https://studypilot-r710.onrender.com/api/health/
- https://studypilot-r710.onrender.com/api/health/deployment/
