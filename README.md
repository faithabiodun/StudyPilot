# StudyPilot: An AI study workspace for students

StudyPilot is a student academic workspace with a React Vite frontend and a
Django REST Framework backend. It turns your study materials, PDFs and YouTube
lectures, into flashcards, quizzes, and Word study notes, and it ships an AI
Advisor, a Resource Hub, Academic Passport onboarding, and full account and
profile management on top of Django JWT auth and Supabase Google OAuth.

- **Live app:** https://nowstudypilot.onrender.com
- **Backend API:** https://studypilotbackend-production-d343.up.railway.app/api
- **Health check:** https://studypilotbackend-production-d343.up.railway.app/api/health/

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
- **Resilient to flaky networks.** The frontend pings the backend on load and
  retries connection level failures with backoff, so a dropped or slow
  connection does not surface as a failed feature. The backend itself runs
  always on, so there is no idle spin down to wait for.

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
- **Hosting:** Render (frontend static site) and Railway (backend web service)

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
