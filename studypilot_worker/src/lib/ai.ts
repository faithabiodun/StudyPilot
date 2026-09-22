// DeepSeek over its OpenAI-compatible REST API. Port of apps/ai/services.py.
// The prompts are copied verbatim so generation quality does not change with
// the backend.

import type { Env } from "../env";
import { intVar } from "../env";
import { chunkText } from "./context";
import { cleanExtractedText } from "./text";

export class AIServiceError extends Error {}
export class AINotConfigured extends Error {}

function apiKey(env: Env): string {
  const key = (env.DEEPSEEK_API_KEY || "").trim();
  if (!key || key === "your_deepseek_api_key_here") throw new AINotConfigured("DeepSeek API key is not configured.");
  return key;
}

interface ChatOptions {
  temperature: number;
  maxTokens: number;
  json?: boolean;
  /** false turns the model's hidden reasoning off. See generateJson. */
  thinking?: boolean;
}

interface ChatResult {
  text: string;
  /** The model hit max_tokens, so whatever came back is cut off mid-answer. */
  truncated: boolean;
}

async function chat(env: Env, messages: { role: string; content: string }[], opts: ChatOptions): Promise<ChatResult> {
  const key = apiKey(env);
  const timeoutMs = intVar(env.DEEPSEEK_TIMEOUT_SECONDS, 45) * 1000;
  const body: Record<string, unknown> = {
    model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.thinking === false) body.thinking = { type: "disabled" };

  let response: Response;
  try {
    response = await fetch(`${(env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    console.warn(`DeepSeek request failed: ${error instanceof Error ? error.message : error}`);
    throw new AIServiceError(opts.json ? "DeepSeek failed to generate a JSON response." : "DeepSeek failed to generate a response.");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Some models reject response_format; fall back to plain text like Python did.
    if (opts.json && detail.toLowerCase().includes("response_format")) {
      return chat(env, messages, { ...opts, json: false });
    }
    console.warn(`DeepSeek returned ${response.status}: ${detail.slice(0, 300)}`);
    throw new AIServiceError(opts.json ? "DeepSeek failed to generate a JSON response." : "DeepSeek failed to generate a response.");
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown }; finish_reason?: string }[];
    usage?: Record<string, number>;
  };
  const choice = payload.choices?.[0];
  const content = choice?.message?.content ?? "";
  // "length" means the model ran out of budget mid-answer, which for JSON means
  // an unparseable half-object. The caller retries rather than guessing.
  const truncated = choice?.finish_reason === "length";
  if (choice?.finish_reason && choice.finish_reason !== "stop") {
    console.warn(`DeepSeek finish_reason=${choice.finish_reason} usage=${JSON.stringify(payload.usage ?? {})}`);
  }
  const text = Array.isArray(content)
    ? cleanExtractedText(content.map((item) => (item as { text?: string })?.text ?? String(item)).join(" "))
    : cleanExtractedText(content);
  return { text, truncated };
}

export async function generateText(env: Env, prompt: string, systemPrompt?: string, temperature = 0.4, maxTokens = 2200): Promise<string> {
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });
  const { text } = await chat(env, messages, { temperature, maxTokens });
  if (!text) throw new AIServiceError("DeepSeek returned an empty response.");
  return text;
}

export function parseJsonPayload(text: string): Record<string, unknown> {
  let cleaned = cleanExtractedText(text).trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").trim().replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = /(\{[\s\S]*\}|\[[\s\S]*\])/.exec(cleaned);
    if (!match) {
      console.warn(`DeepSeek returned no JSON (${cleaned.length} chars): ${cleaned.slice(0, 200)}`);
      throw new AIServiceError("Could not parse AI JSON response.");
    }
    try {
      return JSON.parse(match[1]);
    } catch {
      console.warn(`DeepSeek JSON did not parse (${cleaned.length} chars), tail: ${cleaned.slice(-160)}`);
      throw new AIServiceError("Could not parse AI JSON response.");
    }
  }
}

/**
 * JSON generation, with one retry that turns the model's reasoning off.
 *
 * DeepSeek's reasoning happens inside the same token budget as the answer: a
 * ten-question quiz measured 4,707 reasoning tokens against 1,167 of actual
 * JSON, and on a full-length PDF context the thinking eats the budget and the
 * JSON comes back cut in half. Reasoning is kept for the first attempt because
 * it writes better questions; the retry drops it, which is smaller, faster and
 * reliably complete.
 */
export async function generateJson(env: Env, prompt: string, systemPrompt: string, temperature = 0.3, maxTokens = 2200) {
  const jsonSystem = `${systemPrompt || ""}\nReturn valid JSON only. Do not include markdown fences, commentary, or prose outside JSON.`.trim();
  const messages = [
    { role: "system", content: jsonSystem },
    { role: "user", content: prompt },
  ];
  const attempt = async (thinking: boolean) => {
    const { text, truncated } = await chat(env, messages, { temperature, maxTokens, json: true, thinking });
    if (truncated) throw new AIServiceError("DeepSeek response was cut off before the JSON finished.");
    return parseJsonPayload(text);
  };
  try {
    return await attempt(true);
  } catch (error) {
    if (error instanceof AINotConfigured) throw error;
    console.warn(`DeepSeek JSON attempt failed (${error instanceof Error ? error.message : error}); retrying without reasoning.`);
    return attempt(false);
  }
}

function difficultyGuidance(difficulty: string): string {
  return (
    {
      easy: "Focus on definitions, direct recall, and basic concepts.",
      medium: "Focus on explanation, comparison, relationships, and examples.",
      hard: "Focus on application, reasoning, analysis, and exam-style questions.",
    } as Record<string, string>
  )[(difficulty || "").toLowerCase()] ?? "Focus on explanation, comparison, relationships, and examples.";
}

const SUBTOPIC_RULE = `Every question needs a "subtopic": the one concept it tests, as a short lowercase
hyphenated slug, for example "beta-blocker-selectivity" or "third-normal-form".
Use the same slug for every question testing the same concept, and name the
concept rather than the document.`;

export function generateFlashcards(env: Env, context: string, difficulty: string, count: number) {
  const prompt = `
Use the selected PDF context to create smart academic flashcards.
Focus on definitions, key concepts, processes, comparisons, examples, and exam-worthy recall.
Do not copy random sentences. Do not create duplicate cards. Do not invent facts outside the PDF context.

Difficulty: ${difficulty}
Guidance: ${difficultyGuidance(difficulty)}
Number of flashcards: ${count}

Return JSON exactly like:
{"flashcards":[{"question":"string","answer":"string"}]}

Selected PDF context:
${context}
`;
  return generateJson(env, prompt, "You generate high-quality academic flashcards from PDF study context.", 0.25, 10000);
}

export function generateMcqs(env: Env, context: string, difficulty: string, count: number) {
  const prompt = `
Use the selected PDF context to create a smart academic MCQ quiz.
Each question must test a meaningful concept, process, comparison, definition, or example from the PDF.
Each question needs exactly four options, one correct answer, three believable distractors, and a clear explanation.
Avoid obvious distractors, duplicates, vague wording, and random copied sentences.

Difficulty: ${difficulty}
Guidance: ${difficultyGuidance(difficulty)}
Number of MCQs: ${count}

${SUBTOPIC_RULE}

Return JSON exactly like:
{"mcqs":[{"question":"string","subtopic":"string","options":[{"option_text":"string","is_correct":true},{"option_text":"string","is_correct":false},{"option_text":"string","is_correct":false},{"option_text":"string","is_correct":false}],"correct_answer":"string","explanation":"string"}]}

Selected PDF context:
${context}
`;
  return generateJson(env, prompt, "You generate high-quality academic MCQs from PDF study context.", 0.25, 14000);
}

export function generateMixedQuiz(env: Env, context: string, difficulty: string, count: number, questionTypes: string[], focusGuidance = "") {
  const prompt = `
Use the selected PDF context to create a smart mixed academic quiz.
Use only these question types where requested: ${questionTypes.join(", ")}.
Multiple choice questions need four options, one correct answer, believable distractors, and explanations.
True/false questions must be precise and grounded in the PDF.
Short answer and theory questions should test understanding, comparison, processes, and exam-style reasoning.
Avoid vague questions such as "What is discussed in this section?" Do not copy random sentences.

Difficulty: ${difficulty}
Guidance: ${difficultyGuidance(difficulty)}
Number of questions: ${count}

${SUBTOPIC_RULE}

Return JSON exactly like:
{"questions":[{"question_type":"multiple_choice","question":"string","subtopic":"string","options":[{"option_text":"string","is_correct":true},{"option_text":"string","is_correct":false},{"option_text":"string","is_correct":false},{"option_text":"string","is_correct":false}],"correct_answer":"string","explanation":"string"},{"question_type":"true_false","question":"string","subtopic":"string","correct_answer":"True","explanation":"string"},{"question_type":"short_answer","question":"string","subtopic":"string","correct_answer":"string","explanation":"string"},{"question_type":"theory","question":"string","subtopic":"string","correct_answer":"string","explanation":"string"}]}
${focusGuidance}

Selected PDF context:
${context}
`;
  return generateJson(env, prompt, "You generate high-quality mixed academic quizzes from PDF study context.", 0.25, 16000);
}

export interface DocxOptions {
  detail_level: string;
  document_style: string;
  custom_instruction?: string;
  target_pages?: number;
}

export async function generateDocxContent(
  env: Env,
  transcript: string,
  metadata: { title?: string; channel?: string },
  options: DocxOptions,
  // The browser already ran cleanExtractedText; doing it again on an hour-long
  // transcript would spend the request's whole CPU budget for no change.
  alreadyClean = false,
) {
  const cleaned = alreadyClean ? transcript.trim() : cleanExtractedText(transcript);
  let text: string;
  if (cleaned.length > 32000) {
    // Long lectures are summarised chunk by chunk first. The chunks are
    // independent, so they go out together rather than one after another.
    const chunks = chunkText(cleaned, 9000, 400, true).slice(0, 6);
    const summaries = await Promise.all(
      chunks.map((chunk, index) =>
        generateText(
          env,
          `
Summarize this YouTube lecture transcript chunk for later study-document generation.
Keep important concepts, examples, definitions, processes, comparisons, and exam-worthy points.
Do not add unrelated facts. Do not use markdown symbols.

Chunk ${index + 1} of ${chunks.length}:
${chunk}
`,
          "You summarize lecture transcript chunks into clean academic notes.",
          0.2,
          1400,
        ),
      ),
    );
    text = cleanExtractedText(summaries.join("\n\n")).slice(0, 32000);
  } else {
    text = cleaned.slice(0, 32000);
  }
  const prompt = `
You are StudyPilot, an academic document generator for students.

Create a structured study document from the YouTube transcript.

Rules:
- Do not copy the transcript word for word.
- Do not add unrelated facts.
- Do not output raw markdown tables.
- Do not use markdown symbols like ##, **, ---, or pipe tables.
- Return clean structured JSON only.
- Make the document useful for revision, exam preparation, and understanding the lecture.
- If the transcript is short, create the most useful document possible without fake filler.
- If the transcript is long, summarize and organize it into multiple clear sections.

Video title: ${metadata.title || "YouTube Lecture"}
Channel: ${metadata.channel || "Unknown channel"}
Detail level: ${options.detail_level || "comprehensive"}
Document style: ${options.document_style || "study_guide"}
Target pages: ${options.target_pages ?? 30}
Custom instruction: ${options.custom_instruction || "None"}

Return JSON exactly in this shape:
{
  "title": "string",
  "introduction": "string",
  "learning_objectives": ["string"],
  "sections": [
    {
      "heading": "string",
      "summary": "string",
      "key_points": ["string"],
      "examples": ["string"]
    }
  ],
  "key_concepts": [
    {
      "term": "string",
      "definition": "string"
    }
  ],
  "important_takeaways": ["string"],
  "summary": "string",
  "revision_questions": [
    {
      "question": "string",
      "answer": "string"
    }
  ],
  "mcqs": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correct_answer": "string",
      "explanation": "string"
    }
  ],
  "glossary": [
    {
      "term": "string",
      "meaning": "string"
    }
  ],
  "study_checklist": ["string"]
}

Transcript:
${text}
`;
  return generateJson(
    env,
    prompt,
    "You produce clean JSON for StudyPilot DOCX generation. Never include markdown or prose outside JSON.",
    0.25,
    16000,
  );
}
