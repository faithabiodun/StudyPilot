# Study memory and AI Advisor

The deployed Hono API in `studypilot_worker` connects study features to MemWal.
The Django backend is a legacy implementation and does not include these additions.

| Feature | Captured for future chatbot context |
| --- | --- |
| PDF Study Converter | Extracted study text, document title and reference |
| Flashcards | Generated questions and answers; manually created deck descriptions |
| Mixed quizzes and MCQs | Generated questions, answers and explanations |
| Completed quizzes | Selected answers, correct answers, score and topic mistakes |
| YouTube tools | Generated study guides, flashcards and quiz content, linked to the video |
| Resource Hub | Searches and result descriptions/URLs, saved descriptions and opened links |
| AI Advisor | Question and answer pairs, plus the last eight messages of the current chat |
| Existing progress features | Quiz checkpoints, study sessions and weakness records |

Each student's material, conversations and progress use separate namespaces prefixed
with their authenticated user ID. The server owns the MemWal credentials; browsers
never receive its private key. Stored content is reference data, not chatbot instructions.
Academic profile fields continue to live in the project database rather than being
directly exported as a separate MemWal profile record.

AI Advisor's suggested questions are drawn from recent study memories and the student's
database activity log. The log bridges indexing delays and memory outages. The chatbot
receives relevant stored content and conversation history. Opening or searching a resource
does not imply it was read; only resource metadata is available unless content was generated
or supplied. Quiz completion is recorded when all objective questions are answered;
unreviewed theory questions do not count as incorrect. PDF quiz resume reopens the saved
quiz with its saved answers and question position.

## Configuration and verification

Set `MEMWAL_ENABLED=true`, `MEMWAL_ACCOUNT_ID` and `MEMWAL_PRIVATE_KEY` in the backend
environment. Run `npm run walrus:status` for a read-only connection and existing-memory
check. It masks credentials and student content. The diagnostic does not submit a new write.

MemWal accepts write jobs and indexes them asynchronously. Material capture returns
`queued` records rather than claiming confirmed storage. New content can take time to
appear in recall. Memory failures are caught so studying and chatting can continue;
there is currently no durable retry queue for failed captures. Searchable study text is
limited to 200,000 characters per capture and split into 3,500-character chunks.
Existing title-only memories are supported, but content omitted by older versions is
not automatically backfilled into MemWal.

Verification covers feature suggestions, actual content capture, student isolation,
conversation context, disabled memory, outages and authenticated quiz submissions.
Use `npm --prefix studypilot_worker test`, `npm --prefix studypilot_worker run typecheck`,
`npm --prefix studypilot run build`, and `node scripts/build-api.mjs` before deployment.
