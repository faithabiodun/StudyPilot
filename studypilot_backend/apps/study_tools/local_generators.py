import random
import re
from collections import Counter


STOPWORDS = {
    "about", "above", "after", "again", "against", "also", "because", "before", "between", "could", "during",
    "from", "have", "into", "more", "most", "other", "over", "such", "than", "that", "their", "there", "these",
    "this", "those", "through", "under", "using", "when", "where", "which", "while", "with", "within", "would",
    "the", "and", "for", "are", "was", "were", "has", "had", "can", "may", "not", "you", "your", "its", "they",
}


class LocalGenerationError(Exception):
    pass


def clean_text(text):
    text = (text or "").replace("\x00", " ").replace("\ufeff", " ")
    text = re.sub(r"[^\S\r\n]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_into_sentences(text):
    cleaned = clean_text(text)
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", cleaned)
    sentences = []
    for item in parts:
        sentence = re.sub(r"\s+", " ", item).strip()
        words = sentence.split()
        if 8 <= len(words) <= 42 and not re.match(r"^(figure|table|chapter)\s+\d+", sentence, re.I):
            sentences.append(sentence)
    return list(dict.fromkeys(sentences))


def split_into_paragraphs(text):
    paragraphs = []
    for paragraph in re.split(r"\n\s*\n", clean_text(text)):
        value = re.sub(r"\s+", " ", paragraph).strip()
        if 40 <= len(value) <= 900:
            paragraphs.append(value)
    return paragraphs


def extract_keywords(text, limit=50):
    words = re.findall(r"\b[A-Za-z][A-Za-z0-9-]{3,}\b", clean_text(text))
    normalized = [word.lower() for word in words if word.lower() not in STOPWORDS]
    counts = Counter(normalized)
    title_case = {}
    for word in words:
        key = word.lower()
        if key not in title_case and key not in STOPWORDS:
            title_case[key] = word.strip("-")
    return [title_case[word] for word, _ in counts.most_common(limit) if word in title_case]


def detect_headings(text):
    headings = []
    for raw in clean_text(text).splitlines():
        line = raw.strip()
        if not 4 <= len(line) <= 90:
            continue
        words = line.split()
        if len(words) > 10:
            continue
        if re.match(r"^(\d+(\.\d+)*|chapter\s+\d+|unit\s+\d+)\b", line, re.I) or line.istitle() or line.isupper():
            headings.append(re.sub(r"^\d+(\.\d+)*\s*", "", line).strip(" :-"))
    return list(dict.fromkeys([heading for heading in headings if heading]))


def detect_definitions(text):
    sentences = split_into_sentences(text)
    patterns = [
        r"^(?P<term>[A-Z][A-Za-z0-9 -]{2,60})\s+is\s+(?P<definition>.+)$",
        r"^(?P<term>[A-Z][A-Za-z0-9 -]{2,60})\s+refers to\s+(?P<definition>.+)$",
        r"^(?P<term>[A-Z][A-Za-z0-9 -]{2,60})\s+means\s+(?P<definition>.+)$",
        r"^(?P<term>[A-Z][A-Za-z0-9 -]{2,60})\s+can be defined as\s+(?P<definition>.+)$",
    ]
    definitions = []
    for sentence in sentences:
        for pattern in patterns:
            match = re.match(pattern, sentence)
            if match:
                term = match.group("term").strip(" ,:")
                definition = match.group("definition").strip()
                if term.lower() not in STOPWORDS and len(definition.split()) >= 5:
                    definitions.append({"term": term, "definition": definition, "sentence": sentence})
                break
    return definitions


def select_important_sentences(text, limit=100):
    sentences = split_into_sentences(text)
    keywords = {keyword.lower() for keyword in extract_keywords(text, 80)}

    def score(sentence):
        lower = sentence.lower()
        keyword_hits = sum(1 for keyword in keywords if keyword in lower)
        signal_hits = sum(1 for marker in ["important", "therefore", "because", "process", "method", "model", "system", "example", "main", "key"] if marker in lower)
        length_bonus = 1 if 14 <= len(sentence.split()) <= 30 else 0
        return keyword_hits + signal_hits + length_bonus

    ranked = sorted(sentences, key=score, reverse=True)
    return ranked[:limit]


def ensure_source_quality(text):
    if len(clean_text(text)) < 500:
        raise LocalGenerationError("Not enough clean text was found to generate questions.")


def _best_keyword(sentence, fallback):
    sentence_lower = sentence.lower()
    for keyword in fallback:
        if keyword.lower() in sentence_lower:
            return keyword
    return fallback[0] if fallback else "the concept"


def _trim_answer(sentence, max_words=28):
    words = sentence.split()
    if len(words) <= max_words:
        return sentence
    return " ".join(words[:max_words]).rstrip(" ,;:") + "."


def _cycle(items, count):
    if not items:
        return []
    return [items[index % len(items)] for index in range(count)]


def generate_distractors(correct_answer, candidate_sentences):
    correct_clean = _trim_answer(correct_answer)
    options = []
    for sentence in candidate_sentences:
        candidate = _trim_answer(sentence)
        if candidate and candidate.lower() != correct_clean.lower() and candidate not in options:
            options.append(candidate)
        if len(options) == 3:
            break
    while len(options) < 3:
        filler = [
            "It is unrelated to the main topic described in the material.",
            "It only applies when the document gives no supporting explanation.",
            "It is a minor detail and not the main statement from the section.",
        ][len(options)]
        options.append(filler)
    return options


def generate_flashcards_locally(extracted_text, number_of_cards, difficulty):
    ensure_source_quality(extracted_text)
    keywords = extract_keywords(extracted_text, 80)
    definitions = detect_definitions(extracted_text)
    important = select_important_sentences(extracted_text, 120)
    paragraphs = split_into_paragraphs(extracted_text)
    cards = []

    for definition in definitions:
        if len(cards) >= number_of_cards:
            break
        term = definition["term"]
        cards.append({
            "question": f"Define {term}.",
            "answer": _trim_answer(definition["sentence"], 36),
        })

    source_sentences = _cycle(important, number_of_cards * 2)
    for index, sentence in enumerate(source_sentences):
        if len(cards) >= number_of_cards:
            break
        keyword = _best_keyword(sentence, keywords)
        if difficulty == "easy":
            question = f"What does the material explain about {keyword}?"
        elif difficulty == "hard":
            question = f"Why is {keyword} important in this material?"
        else:
            question = f"Explain the role of {keyword} based on the material."
        cards.append({"question": question, "answer": _trim_answer(sentence, 38)})

    for paragraph in paragraphs:
        if len(cards) >= number_of_cards:
            break
        keyword = _best_keyword(paragraph, keywords)
        cards.append({"question": f"What is the main idea of the section on {keyword}?", "answer": _trim_answer(paragraph, 45)})

    if len(cards) < number_of_cards:
        raise LocalGenerationError("Not enough clean text was found to generate questions.")
    return {"flashcards": cards[:number_of_cards]}


def generate_mcqs_locally(extracted_text, number_of_questions, difficulty):
    ensure_source_quality(extracted_text)
    keywords = extract_keywords(extracted_text, 80)
    important = select_important_sentences(extracted_text, max(120, number_of_questions * 6))
    if len(important) < 4:
        raise LocalGenerationError("Not enough clean text was found to generate questions.")
    mcqs = []
    source = _cycle(important, number_of_questions)
    for index, sentence in enumerate(source):
        keyword = _best_keyword(sentence, keywords)
        if difficulty == "hard":
            question = f"Which statement best explains why {keyword} matters in the material?"
        elif difficulty == "easy":
            question = f"Which statement best describes {keyword}?"
        else:
            question = f"Which statement best explains {keyword} in context?"
        correct = _trim_answer(sentence)
        distractors = generate_distractors(correct, important[index + 1:] + important[:index])
        options = [{"option_text": correct, "is_correct": True}] + [{"option_text": item, "is_correct": False} for item in distractors]
        random.Random(f"{keyword}-{index}").shuffle(options)
        mcqs.append({
            "question": question,
            "options": options,
            "correct_answer": correct,
            "explanation": f"The correct option is taken from the PDF section discussing {keyword}.",
        })
    return {"mcqs": mcqs[:number_of_questions]}


def _generate_true_false(important, keywords, count):
    questions = []
    source = _cycle(important, count)
    for index, sentence in enumerate(source):
        keyword = _best_keyword(sentence, keywords)
        is_true = index % 2 == 0
        question_text = sentence if is_true else f"{keyword} is not connected to the main ideas explained in this material."
        questions.append({
            "question_type": "true_false",
            "question": f"True or False: {_trim_answer(question_text, 30)}",
            "options": [
                {"option_text": "True", "is_correct": is_true},
                {"option_text": "False", "is_correct": not is_true},
            ],
            "correct_answer": "True" if is_true else "False",
            "explanation": _trim_answer(sentence, 34),
        })
    return questions


def _generate_short_answer(definitions, important, keywords, count):
    questions = []
    for definition in definitions[:count]:
        questions.append({
            "question_type": "short_answer",
            "question": f"What is {definition['term']}?",
            "correct_answer": _trim_answer(definition["sentence"], 34),
            "explanation": _trim_answer(definition["sentence"], 34),
        })
    for sentence in _cycle(important, count):
        if len(questions) >= count:
            break
        keyword = _best_keyword(sentence, keywords)
        questions.append({
            "question_type": "short_answer",
            "question": f"Briefly explain {keyword}.",
            "correct_answer": _trim_answer(sentence, 34),
            "explanation": _trim_answer(sentence, 34),
        })
    return questions[:count]


def _generate_theory(headings, paragraphs, keywords, count):
    questions = []
    topics = headings[:count] or keywords[:count] or ["the main topic"]
    for index, topic in enumerate(_cycle(topics, count)):
        answer_source = paragraphs[index % len(paragraphs)] if paragraphs else topic
        questions.append({
            "question_type": "theory",
            "question": f"Discuss {topic} as presented in the material.",
            "correct_answer": _trim_answer(answer_source, 55),
            "explanation": "A strong answer should explain the concept, its purpose, and the supporting details from the PDF.",
        })
    return questions[:count]


def generate_mixed_quiz_locally(extracted_text, number_of_questions, difficulty, question_types):
    ensure_source_quality(extracted_text)
    allowed = [item for item in question_types if item in {"multiple_choice", "true_false", "short_answer", "theory"}] or ["multiple_choice"]
    keywords = extract_keywords(extracted_text, 80)
    important = select_important_sentences(extracted_text, 140)
    definitions = detect_definitions(extracted_text)
    headings = detect_headings(extracted_text)
    paragraphs = split_into_paragraphs(extracted_text)
    if len(important) < 4:
        raise LocalGenerationError("Not enough clean text was found to generate questions.")

    per_type = max(1, number_of_questions // len(allowed))
    extras = number_of_questions % len(allowed)
    questions = []
    for index, question_type in enumerate(allowed):
        count = per_type + (1 if index < extras else 0)
        if question_type == "multiple_choice":
            for item in generate_mcqs_locally(extracted_text, count, difficulty)["mcqs"]:
                questions.append({"question_type": "multiple_choice", **item})
        elif question_type == "true_false":
            questions.extend(_generate_true_false(important, keywords, count))
        elif question_type == "short_answer":
            questions.extend(_generate_short_answer(definitions, important, keywords, count))
        elif question_type == "theory":
            questions.extend(_generate_theory(headings, paragraphs, keywords, count))

    if len(questions) < number_of_questions:
        questions.extend(generate_mcqs_locally(extracted_text, number_of_questions - len(questions), difficulty)["mcqs"])
    return {"questions": questions[:number_of_questions]}
