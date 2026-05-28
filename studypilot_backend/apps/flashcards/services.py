def build_mock_flashcards(course_title, number_of_cards, document=None):
    source = document.title if document else course_title
    templates = [
        ("What is the main idea of {source}?", "{source} focuses on important academic concepts that should be reviewed in short study sessions."),
        ("How should a student revise {source}?", "Review the core definitions, create examples, and test yourself with practice questions."),
        ("Why is {source} important?", "{source} supports stronger understanding of course content and exam preparation."),
        ("What is a useful study action for {source}?", "Summarize the topic, identify weak areas, and generate quiz questions."),
    ]
    cards = []
    for index in range(number_of_cards):
        question, answer = templates[index % len(templates)]
        cards.append({"question": question.format(source=source), "answer": answer.format(source=source)})
    return cards
