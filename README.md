# StudyPilot

StudyPilot is a student academic workspace with a React Vite frontend and a Django REST Framework backend. It turns your study materials — PDFs and now YouTube lectures — into flashcards, quizzes, and Word study notes, and it ships an AI Advisor, a Resource Hub, Academic Passport onboarding, and full account/profile management on top of Django JWT auth and Supabase Google OAuth.

## Stacks

### Frontend

| Tool | Version | Role |
| --- | --- | --- |
| React | ^19.0.0 | UI library |
| Vite | ^6.0.7 | Build tool / dev server |
| Tailwind CSS | ^3.4.17 | Styling |
| React Router | ^7.1.1 | Routing |
| Recharts | ^3.8.1 | Dashboard charts |
| @supabase/supabase-js | ^2.105.4 | Supabase Google OAuth client |
| lucide-react | ^0.468.0 | Icons |
| PostCSS / Autoprefixer | ^8.4.49 / ^10.4.20 | CSS pipeline |

### Backend

| Tool | Version | Role |
| --- | --- | --- |
| Django | 6.0.5 | Web framework |
| Django REST Framework | 3.17.1 | REST API |
| djangorestframework-simplejwt | 5.5.1 | JWT auth |
| drf-spectacular | 0.29.0 | OpenAPI schema/docs |
| dj-database-url | 3.1.2 | `DATABASE_URL` parsing |
| psycopg2-binary | 2.9.12 | PostgreSQL driver |
| openai | 2.37.0 | OpenAI-compatible client (DeepSeek) |
| PyMuPDF / pdfplumber | 1.27.2.3 / 0.11.9 | PDF text extraction |
| python-docx | 1.1.2 | Word (DOCX) generation |
| youtube-transcript-api | 0.6.2 | YouTube transcript fetching |
| requests | 2.32.5 | HTTP (timedtext / metadata fallbacks) |
| gunicorn / whitenoise | 26.0.0 / 6.12.0 | Production server / static files |
| Pillow | 12.0.0 | Image support |

### Platform

- **Database:** Supabase PostgreSQL through `DATABASE_URL`
- **OAuth:** Supabase Google OAuth, exchanged for Django JWT
- **AI provider:** DeepSeek V4 Flash through the OpenAI-compatible client
- **Resource Hub:** YouTube Data API, Google Books API, OpenAlex
- **Hosting:** Render (frontend static site + backend web service)

## Repository Structure

```text
studypilot/
  React Vite frontend

studypilot_backend/
  Django REST Framework backend
  apps/youtube_docx/   YouTube → DOCX / flashcards / MCQ / mixed quiz
```

## Main Features

- Student authentication (Django JWT + Supabase Google OAuth)
- Academic Passport onboarding
- Dashboard with activity tracking
- **PDF Study Converter** — upload a PDF, extract text, generate flashcards, MCQs, or a mixed quiz
- **YouTube Converter** — paste a lecture link and turn it into:
  - a downloadable **Word (DOCX)** study document
  - **flashcards**
  - an **MCQ quiz**
  - a **mixed quiz** (multiple choice, true/false, short answer, theory)
- Resource Hub (YouTube, Google Books, OpenAlex)
- AI Advisor
- Profile management and account deletion

### YouTube Converter — reliability

The YouTube transcript is resolved through multiple sources with fallbacks
(`youtube-transcript-api` → YouTube `timedtext` endpoint → video description),
so a single failing source does not break a request. Expected failures (no
captions, bad link, AI hiccup) return clean `400`/`502` messages instead of raw
`500`s, and flashcard/quiz generation retries on a different transcript segment
when the first pass returns too few items.

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

> `YOUTUBE_API_KEY` is optional for the YouTube Converter: transcripts work
> without it, but it enriches the DOCX with the real video title and channel.

## API Endpoints (YouTube Converter)

All require a valid JWT (`Authorization: Bearer <token>`).

| Method | Path | Returns |
| --- | --- | --- |
| `POST` | `/api/youtube/docx/` | Streams a `.docx` study document |
| `POST` | `/api/youtube/flashcards/` | `{ cards: [...] }` |
| `POST` | `/api/youtube/mcq/` | `{ questions: [...] }` |
| `POST` | `/api/youtube/quiz/` | `{ questions: [...] }` |

## Storage Rules

Uploaded PDFs are temporary. The backend extracts text, deletes the physical
PDF, and stores only document metadata and extracted text. YouTube videos are
never downloaded — only the transcript and metadata are used. Do not use
Supabase Storage for uploaded PDFs.

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
