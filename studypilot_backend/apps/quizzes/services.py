def build_mock_questions(course_title, number_of_questions, question_types):
    question_type = question_types[0] if question_types else "multiple_choice"
    base = [
        {
            "question": f"What is a core concept in {course_title}?",
            "correct_answer": "Understanding key definitions and applying them to examples.",
            "explanation": f"This checks whether the student can connect {course_title} theory to practice.",
            "options": [
                "Understanding key definitions and applying them to examples.",
                "Ignoring lecture notes until exams.",
                "Only memorizing unrelated terms.",
                "Skipping practice questions.",
            ],
        },
        {
            "question": f"Which study method best supports {course_title} revision?",
            "correct_answer": "Short review sessions with flashcards and quizzes.",
            "explanation": "Active recall and spaced practice improve retention.",
            "options": [
                "Short review sessions with flashcards and quizzes.",
                "Reading once without practice.",
                "Avoiding examples.",
                "Studying only the night before.",
            ],
        },
    ]
    questions = []
    for index in range(number_of_questions):
        item = base[index % len(base)].copy()
        item["question_type"] = question_type
        questions.append(item)
    return questions
