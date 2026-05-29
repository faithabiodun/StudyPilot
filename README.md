# StudyPilot

StudyPilot is a student academic workspace with a React Vite frontend and Django REST Framework backend. It supports Django JWT authentication, Supabase Google OAuth, Academic Passport onboarding, PDF Study Converter, Resource Hub, AI Advisor, YouTube to DOCX, dashboard activity tracking, and profile management.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, React Router, Recharts
- Backend: Django, Django REST Framework, Simple JWT, drf-spectacular
- Database: Supabase PostgreSQL through `DATABASE_URL`
- OAuth: Supabase Google OAuth, exchanged for Django JWT
- AI provider: DeepSeek V4 Flash through an OpenAI-compatible backend client
- PDF processing: PyMuPDF and pdfplumber
- Resource Hub: YouTube Data API, Google Books API, OpenAlex
- YouTube to DOCX: youtube-transcript-api, yt-dlp, python-docx

## Repository Structure

```text
studypilot/
  React Vite frontend

studypilot_backend/
  Django REST Framework backend
```

## Security

Never commit real secrets. Keep real environment files local or in your deployment provider environment variables.

Do not commit:

- `.env`, `.env.local`, `.env.production`, or other `.env.*` files
- DeepSeek API keys
- Supabase database URLs or passwords
- Supabase service role keys
- Google OAuth secrets
- YouTube or Google Books API keys
- Django `SECRET_KEY`

The frontend must never contain backend-only secrets. It should only receive Vite public variables such as `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.

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

For local development, point the frontend to your local Django backend:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api
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
CORS_ALLOWED_ORIGINS=https://studypilot-sigma.vercel.app,http://localhost:5173,http://127.0.0.1:5173
CSRF_TRUSTED_ORIGINS=https://studypilot-sigma.vercel.app,https://studypilot-r710.onrender.com
DATABASE_URL=
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
YOUTUBE_API_KEY=your_youtube_api_key_here
GOOGLE_BOOKS_API_KEY=your_google_books_api_key_here
OPENALEX_EMAIL=your_email_optional
YOUTUBE_DOCX_TEMP_DIR=temp/youtube_docx
YOUTUBE_DOCX_EXPIRY_MINUTES=60
```

## Supabase Database Setup

1. Create a Supabase project.
2. Copy the PostgreSQL connection string.
3. Store it only in the backend environment as `DATABASE_URL`.
4. Keep `sslmode=require`.
5. Run Django migrations against Supabase:

```powershell
cd studypilot_backend
.\venv\Scripts\python.exe manage.py migrate
```

The frontend should not connect directly to StudyPilot database tables.

## Google OAuth Setup

1. Enable Google OAuth in Supabase Auth.
2. Add local and deployed callback URLs in Supabase:
   - `http://127.0.0.1:5173/auth/callback`
   - `https://your-frontend.vercel.app/auth/callback`
3. Set frontend env:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Set backend env:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

The React app receives the Supabase OAuth session, sends the Supabase access token to Django, and Django returns the final StudyPilot JWT.

## DeepSeek API Setup

StudyPilot uses DeepSeek V4 Flash for AI-powered responses and generation. Store the API key only in backend environment variables:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

The frontend never calls DeepSeek directly.

## YouTube and Books API Setup

Resource Hub uses backend-only API keys:

```env
YOUTUBE_API_KEY=your_youtube_api_key_here
GOOGLE_BOOKS_API_KEY=your_google_books_api_key_here
OPENALEX_EMAIL=your_email_optional
```

If one external API is unavailable, StudyPilot should still return resources from the APIs that work.

## Storage Rules

Uploaded PDFs are temporary. The backend extracts text, deletes the physical PDF, and stores only document metadata and extracted text.

Generated YouTube DOCX files are temporary. They are stored only long enough for download and should be cleaned after download or expiry. On Render, use temporary directories such as:

```env
YOUTUBE_AUDIO_TEMP_DIR=/tmp/youtube_audio
YOUTUBE_DOCX_TEMP_DIR=/tmp/youtube_docx
```

Do not use Supabase Storage for uploaded PDFs or generated DOCX files.

## Run Locally

Backend:

```powershell
cd studypilot_backend
.\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Frontend:

```powershell
cd studypilot
npm run dev
```

Open:

- Frontend: `http://127.0.0.1:5173`
- Backend health: `http://127.0.0.1:8000/api/health/`
- API docs: `http://127.0.0.1:8000/api/docs/`

## Deploy Frontend to Vercel

1. Import the repository in Vercel.
2. Set the frontend project root to `studypilot`.
3. Use the default Vite build:
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: `dist`
4. Add frontend environment variables:
   - `VITE_API_BASE_URL=https://studypilot-r710.onrender.com/api`
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
5. Deploy.

The frontend includes a `vercel.json` rewrite so React routes work on refresh.

## Push to GitHub

Push from the `studypilot-project` root so GitHub receives both apps together:

```powershell
cd "C:\Users\User\Documents\New project\studypilot-project"
git init
git status
git add .gitignore README.md studypilot studypilot_backend
git commit -m "Prepare StudyPilot for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Before committing, confirm `.env`, `.env.*`, `node_modules`, `dist`, `media`, `temp`, `venv`, logs, and `.vercel` are ignored.

## Deploy Backend to Render

1. Create a Render Web Service from this repository.
2. Set the backend root directory to `studypilot_backend`.
3. Use:
   - Build command: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
   - Start command: `gunicorn config.wsgi:application`
   - Health check path: `/api/health/`
4. Add backend environment variables:
   - `SECRET_KEY`
   - `DEBUG=False`
   - `ALLOWED_HOSTS=studypilot-r710.onrender.com,localhost,127.0.0.1`
   - `CORS_ALLOWED_ORIGINS=https://studypilot-sigma.vercel.app,http://localhost:5173,http://127.0.0.1:5173`
   - `CSRF_TRUSTED_ORIGINS=https://studypilot-sigma.vercel.app,https://studypilot-r710.onrender.com`
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `DEEPSEEK_API_KEY`
   - `DEEPSEEK_BASE_URL=https://api.deepseek.com`
   - `DEEPSEEK_MODEL=deepseek-v4-flash`
   - `YOUTUBE_API_KEY`
   - `GOOGLE_BOOKS_API_KEY`
   - `OPENALEX_EMAIL`
   - `MEDIA_ROOT=/tmp/studypilot_media`
   - `FILE_UPLOAD_TEMP_DIR=/tmp/studypilot_uploads`
   - `YOUTUBE_AUDIO_TEMP_DIR=/tmp/youtube_audio`
   - `YOUTUBE_DOCX_TEMP_DIR=/tmp/youtube_docx`
   - `YOUTUBE_DOCX_EXPIRY_MINUTES=60`
5. Use the Supabase PostgreSQL pooled `DATABASE_URL` with `sslmode=require`.

## Test Live Deployment

1. Open `https://studypilot-r710.onrender.com/api/health/`.
2. Open `https://studypilot-r710.onrender.com/api/docs/`.
3. Open `https://studypilot-sigma.vercel.app`.
4. Register or sign in.
5. Test Google OAuth callback.
6. Upload a PDF and confirm the PDF file is not retained.
7. Generate PDF study outputs.
8. Search Resource Hub and open a result.
9. Ask AI Advisor a direct question.
10. Generate and download a YouTube DOCX, then confirm it is temporary.
11. Open Dashboard and Profile.

## Build Checks

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
