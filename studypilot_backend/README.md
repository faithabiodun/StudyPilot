# StudyPilot Backend

Django REST Framework backend for **StudyPilot**, a web based AI powered academic advising and student success support system.

## Stack

- Django
- Django REST Framework
- PostgreSQL
- Simple JWT
- Google OAuth ID token verification with `google-auth`
- DeepSeek V4 Flash through the compatible chat-completions SDK for AI Advisor and future AI features
- CORS for the React frontend
- PyMuPDF and pdfplumber for PDF text extraction
- YouTube transcript extraction and DOCX generation with `youtube-transcript-api`, `yt-dlp`, and `python-docx`
- drf-spectacular for Swagger/OpenAPI docs

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
    youtube_docx/
    dashboard/
```

## Environment Setup

Create a `.env` file from `.env.example`:

```env
SECRET_KEY=change-me
DEBUG=True
DATABASE_URL=
DATABASE_CONN_MAX_AGE=0
DATABASE_NAME=studypilot_db
DATABASE_USER=postgres
DATABASE_PASSWORD=your_postgres_password
DATABASE_HOST=localhost
DATABASE_PORT=5432
ALLOWED_HOSTS=studypilot-r710.onrender.com,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://studypilot-sigma.vercel.app,http://localhost:5173,http://127.0.0.1:5173
CSRF_TRUSTED_ORIGINS=https://studypilot-sigma.vercel.app,https://studypilot-r710.onrender.com
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
YOUTUBE_DOCX_TEMP_DIR=temp/youtube_docx
YOUTUBE_AUDIO_TEMP_DIR=temp/youtube_audio
YOUTUBE_DOCX_EXPIRY_MINUTES=60
ENABLE_AUDIO_TRANSCRIPTION=True
WHISPER_MODEL_SIZE=base
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7
```

Leave `DATABASE_URL` empty for local PostgreSQL. Set it only when you want Django to connect to a hosted PostgreSQL database.

## PostgreSQL Setup

Create the database before running migrations:

```sql
CREATE DATABASE studypilot_db;
```

Make sure PostgreSQL is running on `localhost:5432` and that the credentials in `.env` match your local setup.

## Using Supabase PostgreSQL

StudyPilot can use Supabase only as hosted PostgreSQL database storage. Django REST Framework still controls all backend APIs, Django JWT and Google OAuth still control authentication, and the React frontend should never connect directly to Supabase.

To use Supabase, put the hosted connection string in `studypilot_backend/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

Keep `sslmode=require` in the URL. If your database password contains special URL characters such as `#`, URL encode them before saving the value in `.env`. The default `DATABASE_CONN_MAX_AGE=0` keeps Django from holding long-lived app connections on top of the Supabase pooler.

Supabase projects can expose different pooler modes. If the session pooler on port `5432` closes the connection, use the transaction pooler URL from your Supabase dashboard, usually the same host with port `6543`.

When `DATABASE_URL` is present, StudyPilot uses it. When it is empty or missing, StudyPilot falls back to:

```env
DATABASE_NAME=studypilot_db
DATABASE_USER=postgres
DATABASE_PASSWORD=your_postgres_password
DATABASE_HOST=localhost
DATABASE_PORT=5432
```

## Install and Run

```powershell
cd "C:\Users\User\Documents\New project\studypilot_backend"
python -m pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py seed_studypilot
python manage.py createsuperuser
python manage.py runserver
```

If Python is not on PATH in the Codex desktop environment, use the bundled runtime:

```powershell
& "C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" manage.py runserver
```

## Default Seed Users

Run `python manage.py seed_studypilot` after migrations.

Admin:

- Email: `admin@studypilot.local`
- Password: `AdminPass123`
- Role: `admin`

Student:

- Email: `student@studypilot.local`
- Password: `StudentPass123`
- Role: `student`

## Authentication Flow

### Register

`POST /api/auth/register/`

```json
{
  "full_name": "Alex Johnson",
  "email": "student@example.com",
  "password": "StudentPass123",
  "confirm_password": "StudentPass123",
  "role": "student"
}
```

### Login

`POST /api/auth/login/`

```json
{
  "email": "student@example.com",
  "password": "StudentPass123"
}
```

Response:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "access": "...",
    "refresh": "...",
    "user": {
      "id": 1,
      "email": "student@example.com",
      "full_name": "Alex Johnson",
      "role": "student"
    }
  }
}
```

### Google OAuth

`POST /api/auth/google/`

The frontend should send the Google credential or ID token:

```json
{
  "credential": "GOOGLE_ID_TOKEN"
}
```

The backend verifies the ID token using `google-auth`, creates the user if needed, assigns `student` by default, and returns JWT tokens.

### Supabase Google OAuth Bridge

`POST /api/auth/supabase-google/`

The React frontend signs in with Google through Supabase Auth, then sends the Supabase access token to Django:

```json
{
  "access_token": "SUPABASE_ACCESS_TOKEN"
}
```

Django verifies the token against Supabase Auth, creates or fetches the matching StudyPilot student account, then returns the normal StudyPilot JWT access and refresh tokens. Protected StudyPilot APIs should continue using Django JWT, not Supabase tokens.

## Supabase Google OAuth Setup

1. Go to Supabase Dashboard.
2. Open Authentication > Providers > Google.
3. Enable the Google provider.
4. Copy the Supabase callback URL shown by Supabase.
5. Go to Google Cloud Console.
6. Create an OAuth Client ID for a Web application.
7. Add `http://localhost:5173` and `http://127.0.0.1:5173` as authorized JavaScript origins.
8. Add the Supabase callback URL as an authorized redirect URI.
9. Paste the Google Client ID and Secret into Supabase.
10. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the frontend `.env`.
11. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the backend `.env`.
12. Restart the frontend and backend.

Supabase is used only for Google OAuth and hosted PostgreSQL. Do not expose `DATABASE_URL` or any Supabase service role key in the frontend, and do not query StudyPilot database tables directly from React.

## API Documentation

- Schema: `GET /api/schema/`
- Swagger UI: `GET /api/docs/`

## Render Deployment

Deploy `studypilot_backend/` as a Render Web Service.

Recommended Render settings:

- Runtime: Python
- Root directory: `studypilot_backend`
- Build command: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
- Start command: `gunicorn config.wsgi:application`
- Health check path: `/api/health/`

The included `Procfile` also defines:

```text
web: gunicorn config.wsgi:application
```

Set these Render environment variables:

```env
SECRET_KEY=your_production_secret_key
DEBUG=False
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
DATABASE_CONN_MAX_AGE=0
ALLOWED_HOSTS=studypilot-r710.onrender.com,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://studypilot-sigma.vercel.app,http://localhost:5173,http://127.0.0.1:5173
CSRF_TRUSTED_ORIGINS=https://studypilot-sigma.vercel.app,https://studypilot-r710.onrender.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_SECONDS=45
MAX_DEEPSEEK_CONTEXT_CHARS=20000
MAX_PDF_PAGES=50
MAX_EXTRACTED_TEXT_CHARS=80000
MAX_UPLOAD_SIZE=12582912
MEDIA_ROOT=/tmp/studypilot_media
FILE_UPLOAD_TEMP_DIR=/tmp/studypilot_uploads
YOUTUBE_API_KEY=your_youtube_api_key_here
GOOGLE_BOOKS_API_KEY=your_google_books_api_key_here
OPENALEX_EMAIL=your_email_optional
YOUTUBE_AUDIO_TEMP_DIR=/tmp/youtube_audio
YOUTUBE_DOCX_TEMP_DIR=/tmp/youtube_docx
YOUTUBE_DOCX_EXPIRY_MINUTES=60
ENABLE_AUDIO_TRANSCRIPTION=True
WHISPER_MODEL_SIZE=base
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7
```

Use the Supabase pooled PostgreSQL `DATABASE_URL` and keep `sslmode=require`.

Temporary file behavior:

- Uploaded PDFs are written to `MEDIA_ROOT`, extracted, then deleted.
- YouTube audio and DOCX files use `/tmp/...` paths and are temporary.
- Do not use Supabase Storage for uploaded PDFs or generated DOCX files.

After deployment, test:

```powershell
curl https://studypilot-r710.onrender.com/api/health/
```

Expected response:

```json
{
  "success": true,
  "message": "StudyPilot backend is running"
}
```

## DeepSeek AI Features

StudyPilot uses DeepSeek V4 Flash from the Django backend for AI Advisor responses, PDF study generation, and YouTube to DOCX study document generation. The React frontend never calls DeepSeek directly and must never contain the DeepSeek API key.

Put the key only in `studypilot_backend/.env`:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_SECONDS=45
MAX_DEEPSEEK_CONTEXT_CHARS=20000
```

PDF text extraction still uses PyMuPDF first and pdfplumber as fallback. PDF to Flashcards, PDF to MCQ Quiz, and PDF to Mixed Quiz use the focused 40% to 80% page range when enough text is available, select meaningful study context, then ask DeepSeek V4 Flash to generate smart academic output.

## Resource Hub APIs

Resource Hub recommendations are fetched by Django only. API keys stay in `studypilot_backend/.env`:

```env
YOUTUBE_API_KEY=your_youtube_api_key_here
GOOGLE_BOOKS_API_KEY=your_google_books_api_key_here
OPENALEX_EMAIL=your_email_optional
```

YouTube results use exact `https://www.youtube.com/watch?v=VIDEO_ID` links. Textbook results use Google Books preview or info links. Articles use OpenAlex with Crossref-style source links where available.

## YouTube to DOCX

StudyPilot can convert a YouTube lecture transcript into a temporary downloadable DOCX. It uses `youtube-transcript-api` for transcript extraction, `yt-dlp` for metadata/subtitle fallback, `webvtt-py` for VTT subtitle parsing, DeepSeek V4 Flash for structured study content, and `python-docx` for file generation. Videos are not downloaded.

The feature supports an analyze-first workflow: React sends a YouTube URL to Django, Django extracts the video ID, fetches metadata, checks transcript availability, and returns preview data. Generation then accepts detail level, document style, key-frame/timestamp preference, custom instructions, and an optional manual transcript fallback. DeepSeek transforms the transcript into structured academic study notes, questions, glossary terms, and a checklist.

DOCX files are written only to temporary local storage and are not saved in Supabase, media storage, or the database. Configure cleanup with:

```env
YOUTUBE_DOCX_TEMP_DIR=temp/youtube_docx
YOUTUBE_DOCX_EXPIRY_MINUTES=60
```

## API Endpoints

### Auth

- `POST /api/auth/register/`
- `POST /api/auth/login/`
- `POST /api/auth/google/`
- `POST /api/auth/token/refresh/`
- `POST /api/auth/logout/`
- `GET /api/auth/me/`
- `PATCH /api/auth/profile/`

### Academics

- `GET /api/academics/courses/`
- `POST /api/academics/courses/` admin only

### Documents

- `GET /api/documents/`
- `POST /api/documents/upload/`
- `POST /api/documents/cleanup-temp/`
- `GET /api/documents/<id>/`
- `DELETE /api/documents/<id>/`
- `POST /api/documents/<id>/extract-text/`

PDF uploads are extracted with PyMuPDF first and pdfplumber as fallback. StudyPilot stores document metadata and extracted text only. The physical PDF file is deleted after extraction, and failed extractions also delete the temporary upload. React should call `POST /api/documents/cleanup-temp/` before logout to remove any remaining temporary files.

### Flashcards

- `GET /api/flashcards/decks/`
- `POST /api/flashcards/decks/`
- `GET /api/flashcards/decks/<id>/`
- `DELETE /api/flashcards/decks/<id>/`
- `POST /api/flashcards/generate/`

`POST /api/flashcards/generate/` selects meaningful context from the saved PDF text and uses DeepSeek V4 Flash to create smart flashcards. It requires `document_id`, `number_of_cards`, and `difficulty`. `number_of_cards` must be `10`, `20`, or `30`. `course_title` is optional only for backward compatibility and is not used by the PDF Study Converter UI.

### Quizzes

- `GET /api/quizzes/`
- `POST /api/quizzes/generate/`
- `POST /api/quizzes/generate-mcq/`
- `GET /api/quizzes/<id>/`
- `POST /api/quizzes/<id>/submit/`

Quiz generation selects meaningful context from saved PDF text, uses DeepSeek V4 Flash, and saves the generated questions/options. `POST /api/quizzes/generate/` requires `document_id`, `number_of_questions`, `difficulty`, and `question_types`. `POST /api/quizzes/generate-mcq/` requires `document_id`, `number_of_questions`, `difficulty`, and `show_explanations`. `number_of_questions` must be `10`, `20`, or `30`.

### Resources

- `GET /api/resources/recommendations/?q=compiler construction&type=youtube`
- `GET /api/resources/recommendations/?q=software engineering&type=textbooks`
- `GET /api/resources/recommendations/?q=machine learning&type=articles`
- `POST /api/resources/save/`
- `GET /api/resources/saved/`
- `DELETE /api/resources/saved/<id>/`

The student-facing Resource Hub uses only YouTube, Textbooks, and Articles tabs. Django calls YouTube Data API, Google Books, and OpenAlex/Crossref-style article sources from the backend so API keys are never exposed in React.

### AI Advisor

- `GET /api/advisor/sessions/`
- `POST /api/advisor/sessions/`
- `GET /api/advisor/sessions/<id>/`
- `POST /api/advisor/chat/`

The advisor uses DeepSeek V4 Flash with the student's Academic Passport as background context. It can include Resource Hub recommendations for resource requests and uploaded PDF context for document-specific questions.

### YouTube to DOCX

- `POST /api/youtube-docx/analyze/`
- `POST /api/youtube-docx/generate/`
- `GET /api/youtube-docx/download/<temp_file_id>/`

`POST /api/youtube-docx/analyze/` returns video preview data including title, channel, duration, thumbnail, canonical YouTube URL, and transcript availability.

`POST /api/youtube-docx/generate/` accepts `youtube_url`, `detail_level`, `document_style`, `key_frames`, `custom_instruction`, and optional `manual_transcript`. It fetches or accepts transcript text, uses DeepSeek V4 Flash to create structured academic study content, writes a temporary DOCX file, and returns a temporary download URL. The generated file is deleted after download when possible, and old temporary files are cleaned automatically.

### Dashboard

- `GET /api/dashboard/summary/`

### Admin

Admin routes require `role=admin`.

- `GET /api/admin/summary/`
- `GET /api/admin/users/`
- `GET /api/admin/documents/`

## Frontend Connection

Set your React frontend API base URL with a Vite environment variable:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

For production, the frontend should use the Render backend:

```env
VITE_API_BASE_URL=https://studypilot-r710.onrender.com/api
```

Send the JWT access token with protected requests:

```http
Authorization: Bearer <access_token>
```

## Response Format

Most StudyPilot endpoints return:

```json
{
  "success": true,
  "message": "Action completed successfully",
  "data": {}
}
```

Errors return:

```json
{
  "success": false,
  "message": "Error message",
  "errors": {}
}
```

SimpleJWT refresh responses keep the standard token format.
