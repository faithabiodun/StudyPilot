# StudyPilot: An AI study workspace for students

StudyPilot is a student academic workspace. It turns your study materials, PDFs and YouTube
lectures, into flashcards, quizzes, and Word study notes, and it ships an AI
Advisor, a Resource Hub, Academic Passport onboarding, and full account and
profile management on top of Django JWT auth, Supabase Google OAuth, and Sui
wallet sign-in.

It also **remembers**. Every wrong answer, every lecture you convert, every day
you study and every half-finished quiz is written to
[Walrus Memory](https://memory.walrus.xyz) through
[MemWal](https://github.com/MystenLabs/MemWal), so the app stops being a record
of what it asked you and becomes a memory of what you keep getting wrong. The
same memory is readable from any other MemWal client on the same account.

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
- **Mistake memory on Walrus.** Submitting a quiz stores a record per wrong
  answer and per correct answer on a topic you previously missed. A weakness
  briefing ranks topics by misses, severity and recency, and quiz generation is
  weighted roughly 60 percent toward what you keep getting wrong.
- **It knows what you have studied.** PDFs, YouTube lectures, generated decks and
  saved resources are remembered too, so the advisor can build on a video you
  converted instead of explaining from scratch.
- **Nothing is lost when you close the tab.** Answering a quiz checkpoints it to
  Walrus, so logging out, running out of battery, or moving to another device
  still lets you pick up where you stopped.
- **Secure auth.** Django JWT with transparent token refresh, Supabase Google
  OAuth, and Sui wallet sign-in where the wallet signs a server-issued nonce,
  never a transaction.
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
| Weakness briefing | `/api/memory/briefing/` | Topics ranked by how badly you keep missing them. |
| Study history | `/api/memory/history/` | Days studied, read back out of Walrus. |
| Resume | `/api/memory/resume/` | Unfinished quizzes and decks, with your answers. |

## How the memory works

Walrus Memory is **append-only**: there is no update and no delete. Everything
below follows from that. StudyPilot never stores a counter; it appends a record
per event and counts them at recall time. Finishing something appends a
`status:done` record rather than removing the active one.

Records carry a pipe-delimited header so they can be parsed and ranked, with
prose underneath so semantic recall can still find them:

```
MISS | sp-u17-pharmacology | beta-blocker-selectivity | 2026-08-23 | sev:medium
Q: Which beta blocker is cardioselective?
I answered: Propranolol. My misconception: answered Propranolol instead of Atenolol.
Correct: Atenolol
```

### Three namespaces, deliberately separate

| Namespace | Holds | Why it is on its own |
| --- | --- | --- |
| `sp-u{id}-{course}` | `MISS`, `HIT`, `MASTERED` | The briefing ranks over whatever a recall returns |
| `sp-u{id}-studied` | `MATERIAL`, `SESSION` | Uploads and lectures would bury real mistakes |
| `sp-u{id}-progress` | `PROGRESS` | One checkpoint per answer is noisy by nature |

Mixing these would break the product, not just the tidiness: a namespace full of
PDFs you never got wrong would push your actual mistakes out of the top five.

### Relevance filtering

`recall` returns its top *k* regardless of relevance, so an unrelated question
still comes back with *k* records. Measured against a live namespace, on-topic
hits sit at 0.35 to 0.64 cosine distance and unrelated ones at 0.84 and above,
so the advisor passes `max_distance=0.70`. The briefing and study history
deliberately do **not** filter, because they are counting rather than matching,
and filtering a count would undercount misses. See
[MystenLabs/MemWal#741](https://github.com/MystenLabs/MemWal/issues/741).


