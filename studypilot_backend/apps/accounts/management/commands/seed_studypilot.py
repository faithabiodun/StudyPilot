from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from apps.academics.models import Course
from apps.advisor.models import ChatMessage, ChatSession
from apps.documents.models import Document
from apps.flashcards.models import Flashcard, FlashcardDeck
from apps.quizzes.models import Quiz, QuizOption, QuizQuestion
from apps.resources.models import SavedResource
from apps.accounts.models import User


class Command(BaseCommand):
    help = "Seed StudyPilot with demo admin, student, and sample academic records."

    def handle(self, *args, **options):
        admin, _ = User.objects.get_or_create(
            email="admin@studypilot.local",
            defaults={"full_name": "StudyPilot Admin", "role": User.Role.ADMIN, "is_staff": True, "is_superuser": True},
        )
        admin.set_password("AdminPass123")
        admin.is_staff = True
        admin.is_superuser = True
        admin.role = User.Role.ADMIN
        admin.save()

        student, _ = User.objects.get_or_create(
            email="student@studypilot.local",
            defaults={
                "full_name": "Alex Johnson",
                "role": User.Role.STUDENT,
                "department": "Computer Science",
                "level": "300",
                "institution": "StudyPilot University",
            },
        )
        student.set_password("StudentPass123")
        student.full_name = student.full_name or "Alex Johnson"
        student.profile_completed = True
        student.matric_number = student.matric_number or "STP/CSC/300/001"
        student.faculty = student.faculty or "Computing"
        student.department = "Computer Science"
        student.level = "300 Level"
        student.semester = student.semester or "Second Semester"
        student.institution = "StudyPilot University"
        student.current_courses = student.current_courses or [
            {"code": "CSC 310", "title": "Database Systems"},
            {"code": "CSC 415", "title": "Compiler Construction"},
        ]
        student.academic_goal = student.academic_goal or ["Prepare for exams", "Generate quizzes and flashcards"]
        student.weak_courses = student.weak_courses or ["Compiler Construction"]
        student.preferred_learning_style = student.preferred_learning_style or "Step by step explanations"
        student.preferred_resource_types = student.preferred_resource_types or ["YouTube videos", "PDF notes", "Practice quizzes"]
        student.study_hours_per_week = student.study_hours_per_week or 12
        student.exam_preparation_focus = student.exam_preparation_focus or "Database Systems mid-semester test"
        student.career_interest = student.career_interest or "Backend engineering and AI systems"
        student.save()

        Course.objects.get_or_create(code="CSC 310", defaults={"title": "Database Systems", "department": "Computer Science", "level": "300"})
        Course.objects.get_or_create(code="CSC 415", defaults={"title": "Compiler Construction", "department": "Computer Science", "level": "400"})

        document, created = Document.objects.get_or_create(
            user=student,
            title="Database Systems Notes",
            defaults={"file_type": "txt", "file_size": 64, "extracted_text": "Normalization, SQL, indexing, and transactions.", "status": Document.Status.PROCESSED},
        )
        if created:
            document.file.save("database-systems-notes.txt", ContentFile(b"Normalization, SQL, indexing, and transactions."), save=True)

        deck, _ = FlashcardDeck.objects.get_or_create(user=student, title="Database Systems Flashcards", defaults={"course_title": "Database Systems", "document": document})
        if not deck.cards.exists():
            Flashcard.objects.create(deck=deck, question="What is normalization?", answer="A process of organizing data to reduce redundancy.")
            Flashcard.objects.create(deck=deck, question="What is SQL?", answer="A language for querying and managing relational databases.")

        quiz, _ = Quiz.objects.get_or_create(user=student, course_title="Database Systems", defaults={"document": document, "difficulty": "beginner", "number_of_questions": 1})
        if not quiz.questions.exists():
            question = QuizQuestion.objects.create(quiz=quiz, question="Which clause groups rows?", correct_answer="GROUP BY", explanation="GROUP BY groups matching rows for aggregate queries.")
            QuizOption.objects.bulk_create([
                QuizOption(question=question, option_text="GROUP BY", is_correct=True),
                QuizOption(question=question, option_text="ORDER BY"),
                QuizOption(question=question, option_text="INSERT"),
                QuizOption(question=question, option_text="DROP"),
            ])

        SavedResource.objects.get_or_create(
            user=student,
            title="Database Normalization Tutorial",
            defaults={"resource_type": "youtube", "description": "A beginner friendly normalization walkthrough.", "url": "https://www.youtube.com/", "course_title": "Database Systems"},
        )

        session, _ = ChatSession.objects.get_or_create(user=student, title="Course preparation advice")
        if not session.messages.exists():
            ChatMessage.objects.create(session=session, sender=ChatMessage.Sender.USER, message="How should I prepare for CSC 310?")
            ChatMessage.objects.create(session=session, sender=ChatMessage.Sender.ASSISTANT, message="Review normalization, SQL joins, transactions, and practice with short quizzes.")

        self.stdout.write(self.style.SUCCESS("StudyPilot seed data created."))
