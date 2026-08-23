import logging

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from apps.documents.models import Document
from apps.documents.rag import retrieve_relevant_chunks
from apps.documents.services import clean_extracted_text
from apps.resources.services import get_combined_recommendations
from apps.ai.services import AIServiceError, generate_text_with_deepseek
from apps.memory.services import misconception_context

logger = logging.getLogger(__name__)


RESOURCE_KEYWORDS = {
    "recommend",
    "resource",
    "resources",
    "youtube",
    "video",
    "videos",
    "textbook",
    "book",
    "books",
    "article",
    "articles",
    "link",
    "links",
    "tutorial",
    "material",
    "materials",
}

PDF_KEYWORDS = {
    "pdf",
    "document",
    "uploaded",
    "upload",
    "summarize",
    "summary",
    "key points",
    "questions from",
}

DIRECT_EXPLANATION_KEYWORDS = {
    "difference between",
    "what is",
    "explain",
    "define",
    "meaning of",
    "compare",
}

PLAN_KEYWORDS = {
    "study plan",
    "timetable",
    "schedule",
    "prepare",
    "preparation",
}


def has_any_keyword(message, keywords):
    text = (message or "").lower()
    return any(keyword in text for keyword in keywords)


def classify_intent(message):
    text = (message or "").lower()
    if has_any_keyword(text, PDF_KEYWORDS) or "from the pdf" in text or "my pdf" in text or "uploaded pdf" in text:
        return "pdf"
    if has_any_keyword(text, RESOURCE_KEYWORDS):
        return "resources"
    if has_any_keyword(text, PLAN_KEYWORDS):
        return "study_plan"
    if has_any_keyword(text, DIRECT_EXPLANATION_KEYWORDS) or text.endswith("?"):
        return "direct_explanation"
    return "direct_explanation"


def academic_passport_context(user):
    try:
        fields = [
            ("Department", getattr(user, "department", "")),
            ("Level", getattr(user, "level", "")),
            ("Semester", getattr(user, "semester", "")),
            ("Current courses", getattr(user, "current_courses", "")),
            ("Academic goal", getattr(user, "academic_goal", "")),
            ("Weak courses/topics", getattr(user, "weak_courses", "")),
            ("Preferred learning style", getattr(user, "preferred_learning_style", "")),
            ("Preferred resource types", getattr(user, "preferred_resource_types", "")),
            ("Study hours per week", getattr(user, "study_hours_per_week", "")),
            ("Exam preparation focus", getattr(user, "exam_preparation_focus", "")),
            ("Career interest", getattr(user, "career_interest", "")),
        ]
        lines = []
        for label, value in fields:
            if value in (None, "", []):
                continue
            lines.append(f"{label}: {value}")
        return "\n".join(lines) or "Academic Passport is incomplete."
    except Exception:
        logger.warning("Advisor profile context failed")
        return "Academic Passport is unavailable for this response."


def infer_resource_type(message):
    text = (message or "").lower()
    if "youtube" in text or "video" in text or "tutorial" in text:
        return "youtube"
    if "textbook" in text or "book" in text:
        return "textbooks"
    if "article" in text or "paper" in text or "research" in text:
        return "articles"
    return "youtube"


def clean_resource_query(message):
    text = (message or "").strip()
    lowered = text.lower()
    starters = [
        "recommend youtube videos for",
        "recommend videos for",
        "recommend resources for",
        "give me textbooks for",
        "find articles on",
        "find resources for",
        "textbooks for",
        "articles on",
        "youtube videos for",
        "resources for",
    ]
    for starter in starters:
        if lowered.startswith(starter):
            return text[len(starter):].strip(" .?") or text
    return text


def resource_context(message, intent):
    if intent != "resources":
        return "", False
    try:
        data = get_combined_recommendations(clean_resource_query(message), infer_resource_type(message))
        results = data.get("results", [])[:5]
        if not results:
            return "", True
        lines = [
            f"- {item.get('title')} ({item.get('source_name') or item.get('resource_type')}): {item.get('url')}"
            for item in results
        ]
        return "\n".join(lines), True
    except Exception:
        logger.warning("Advisor resource context failed")
        return "", False


def latest_or_selected_document(user, document_id=None):
    queryset = Document.objects.filter(user=user, status=Document.Status.PROCESSED).exclude(extracted_text="")
    if document_id:
        return queryset.filter(id=document_id).first()
    return queryset.order_by("-uploaded_at").first()


def pdf_context(user, message, intent, document_id=None):
    if not document_id and intent != "pdf":
        return "", False
    try:
        document = latest_or_selected_document(user, document_id)
        if not document:
            return "", False
        query = f"{message} academic explanation study plan key points practice questions"
        context = retrieve_relevant_chunks(document, query, limit=6)
        if not context:
            return "", False
        return f"Using document: {document.title or document.original_filename}\n{context}", True
    except Exception:
        logger.warning("Advisor PDF context failed")
        return "", False


def advisor_prompt(message, intent, profile_context, pdf_context_text, resources_text, memory_context=""):
    memory_block = f"""
This student has previously got these things wrong. If the question touches one of
them, open by naming it, say how many times and when they last missed it, and quote
the stored misconception as written rather than softening it, then correct it. If
the question is unrelated to this list, ignore this section completely.
{memory_context}
""" if memory_context else ""
    return f"""
You are StudyPilot, a student academic advisor. Answer the student's actual question directly.
Do not mention internal context, profiles, tools, or process. Do not say "I will".
Use short headings, clear paragraphs, bullets, or simple tables where useful.
For concept questions: define, explain key points, give an example, and add an exam-focused summary.
For study plans: give a practical timetable or checklist.
For resources: include the provided links when available.
For uploaded PDFs: use the provided PDF context when available.
{memory_block}
Student background, if useful:
{profile_context}

Relevant PDF context:
{pdf_context_text or ""}

Resource links:
{resources_text or ""}

Intent: {intent}

Student question:
{message}

Return only the answer.
"""


def extract_difference_terms(text):
    lowered = (text or "").lower()
    marker = "difference between"
    if marker not in lowered:
        return "", ""
    fragment = text[lowered.find(marker) + len(marker):].strip(" ?.!")
    if " and " in fragment:
        left, right = fragment.split(" and ", 1)
        return left.strip(" ?.,"), right.strip(" ?.,")
    return "", ""


def direct_interpreter_compiler_answer():
    return """A compiler translates the entire source code into machine code, bytecode, or an executable form before the program runs. After compilation, the program can usually run without translating the source code again.

An interpreter translates and runs the program step by step at runtime. It usually does not create a separate executable file before execution.

| Point | Compiler | Interpreter |
| --- | --- | --- |
| Translation | Translates the whole program before execution | Translates and executes line by line |
| Output | Often produces an executable or compiled code | Usually runs directly without a separate executable |
| Error handling | Reports many errors after compilation | Stops when it reaches an error during execution |
| Speed | Program execution is usually faster after compilation | Execution is usually slower because translation happens while running |

Examples:
- C and C++ commonly use compilers.
- Python and JavaScript are commonly interpreted, although modern runtimes may also use just-in-time compilation.

Exam summary:
- Compiler means full translation before execution.
- Interpreter means step-by-step translation during execution."""


def direct_normalization_answer():
    return """Database normalization is the process of organizing data in a relational database to reduce redundancy and improve data integrity.

The main idea is to split data into well-structured tables and connect them using keys, instead of storing repeated or mixed information in one large table.

Key points:
- It reduces duplicate data.
- It helps prevent update, insertion, and deletion anomalies.
- It makes relationships between data clearer.
- It usually uses normal forms such as 1NF, 2NF, and 3NF.

Example:
Instead of storing a student's name and department repeatedly in every course registration row, you can store student details in a Students table and course registration details in a separate Registrations table.

Exam summary:
Normalization organizes tables to reduce redundancy and maintain consistency."""


def direct_generic_comparison(message):
    left, right = extract_difference_terms(message)
    if left and right:
        return f"""{left.title()} and {right.title()} are different concepts, so compare them by definition, how they work, and when they are used.

| Point | {left.title()} | {right.title()} |
| --- | --- | --- |
| Meaning | Describes the first concept or approach | Describes the second concept or approach |
| How it works | Works according to its own process or structure | Works using a different process or structure |
| Main exam focus | Know its definition and use case | Know how it differs from {left} |

Exam summary:
State the definition of each term, then explain the main difference in one sentence and give an example."""
    return """This is a concept question, so answer it by giving the definition, the key points, and one example.

Exam summary:
For a strong answer, write the meaning first, then explain how it works, then give a short example."""


def study_plan_fallback(message, profile_context):
    return f"""Study plan:

1. List the major topics in the course and mark the ones you find difficult.
2. Spend the first study session on definitions and core ideas.
3. Use the second session for worked examples or past-question style problems.
4. Use the third session for active recall: flashcards, MCQs, and short written answers.
5. End each week with a short self-test and revise the weakest topic again.

For Compiler Construction, a practical order is:
- Introduction to compilers and interpreters
- Phases of compilation
- Lexical analysis
- Parsing
- Syntax trees
- Semantic analysis
- Intermediate code generation
- Optimization and code generation

Exam summary:
Do not only read notes. Convert each topic into questions and test yourself after studying."""


def resource_fallback(resources_text):
    if resources_text:
        return f"""Recommended resources:

{resources_text}

Use one video for quick understanding, one textbook or article for depth, and then test yourself with questions from the topic."""
    return """No live resource links were available right now.

A good resource mix is:
- One beginner-friendly tutorial video
- One textbook chapter or lecture note
- One article or documentation page
- Practice questions after studying

Search Resource Hub with the exact topic name for stronger results."""


def pdf_fallback(pdf_context_text):
    if pdf_context_text:
        return f"""Summary from the uploaded document context:

{pdf_context_text[:1800]}

Study focus:
- Identify the main definitions.
- Turn headings into short-answer questions.
- Convert key processes into MCQs.
- Review examples separately from theory."""
    return """I could not find readable uploaded PDF context for this question.

General approach:
- Upload a readable PDF in PDF Study Converter.
- Let StudyPilot extract the text.
- Ask for a summary, key points, flashcards, or MCQs from that uploaded document."""


def fallback_advisor_response(message, intent, profile_context, pdf_context_text, resources_text):
    lower_message = (message or "").lower()
    if "interpreter" in lower_message and "compiler" in lower_message:
        return direct_interpreter_compiler_answer()
    if "normalization" in lower_message or "normalisation" in lower_message:
        return direct_normalization_answer()
    if intent == "study_plan":
        return study_plan_fallback(message, profile_context)
    if intent == "resources":
        return resource_fallback(resources_text)
    if intent == "pdf":
        return pdf_fallback(pdf_context_text)
    return direct_generic_comparison(message)


def suggested_followups_for(message, intent):
    text = (message or "").lower()
    if "interpreter" in text and "compiler" in text:
        return [
            "Give examples of compiled and interpreted languages",
            "Explain bytecode in Java",
            "Create MCQs on compilers and interpreters",
        ]
    if "normalization" in text or "normalisation" in text:
        return [
            "Explain 1NF, 2NF, and 3NF",
            "Give an example of database normalization",
            "Create MCQs on normalization",
        ]
    if intent == "resources":
        return [
            "Find textbook resources for this topic",
            "Recommend beginner YouTube tutorials",
            "Turn these resources into a study plan",
        ]
    if intent == "pdf":
        return [
            "Summarize the key points from my PDF",
            "Generate MCQs from my PDF",
            "Create flashcards from this document",
        ]
    if intent == "study_plan":
        return [
            "Turn this into a weekly timetable",
            "Create revision questions for this course",
            "Recommend resources for the hardest topic",
        ]
    return [
        "Explain this with an example",
        "Create MCQs on this topic",
        "Summarize this for exam revision",
    ]


def generate_advisor_response(user, message, document_id=None):
    api_key = (settings.DEEPSEEK_API_KEY or "").strip()
    if not api_key or api_key == "your_deepseek_api_key_here":
        raise ImproperlyConfigured("DeepSeek API key is not configured.")

    intent = classify_intent(message)
    profile_context = academic_passport_context(user)
    pdf_context_text, used_pdf = pdf_context(user, message, intent, document_id)
    resources_text, used_resources = resource_context(message, intent)
    # Recall this student's own past mistakes so the advisor corrects the
    # misconception it already knows about instead of re-teaching from scratch.
    memory_text = misconception_context(user, message, getattr(user, "current_courses", None) or [])
    prompt = advisor_prompt(message, intent, profile_context, pdf_context_text, resources_text, memory_text)

    try:
        response = clean_extracted_text(generate_text_with_deepseek(
            prompt,
            system_prompt="You are StudyPilot. Answer student academic questions directly and clearly.",
            temperature=0.35,
            max_output_tokens=1600,
        ))
    except ImproperlyConfigured:
        raise
    except AIServiceError as exc:
        logger.warning("DeepSeek advisor generation failed: %s", exc)
        if not settings.DEBUG:
            raise AIServiceError("Advisor service failed to generate a response.") from exc
        response = fallback_advisor_response(message, intent, profile_context, pdf_context_text, resources_text)

    return {
        "response": response,
        "used_profile_context": True,
        "used_pdf_context": used_pdf,
        "used_resource_recommendations": used_resources,
        "suggested_followups": suggested_followups_for(message, intent),
    }
