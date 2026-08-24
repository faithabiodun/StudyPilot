# StudyPilot: An AI study workspace for students

StudyPilot is a student academic workspace. It turns your study materials, PDFs and YouTube
lectures, into flashcards, quizzes, and Word study notes, and it ships an AI
Advisor, a Resource Hub, Academic Passport onboarding, and full account and
profile management on top of Django JWT auth and Supabase Google OAuth.

- **Live app:** https://nowstudypilot.onrender.com

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
