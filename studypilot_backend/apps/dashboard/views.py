from django.contrib.auth import get_user_model
from datetime import timedelta
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django.utils import timezone

from apps.advisor.models import ChatMessage
from apps.documents.models import Document
from apps.flashcards.models import Flashcard, FlashcardDeck
from apps.permissions import IsAdminRole
from apps.quizzes.models import Quiz
from apps.resources.models import SavedResource
from apps.utils import success_response

from .models import ActivityLog, LoginActivity, UserSessionActivity
from .services import update_user_session

User = get_user_model()


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        courses = user.current_courses if isinstance(user.current_courses, list) else []
        active_courses = len(courses)
        pdf_documents = Document.objects.filter(user=user).count()
        flashcard_decks = FlashcardDeck.objects.filter(user=user).count()
        quizzes = Quiz.objects.filter(user=user).count()
        generated_outputs = flashcard_decks + quizzes
        resource_results = ActivityLog.objects.filter(user=user, activity_type__in=["resource_search", "resource_opened"]).count()

        recent_activity = [
            {
                "type": item.activity_type,
                "title": item.title,
                "description": item.description,
                "metadata": item.metadata,
                "created_at": item.created_at,
            }
            for item in ActivityLog.objects.filter(user=user).order_by("-created_at")[:5]
        ]

        today = timezone.localdate()
        start_date = today - timedelta(days=6)
        session_rows = {
            item.session_date: item.duration_seconds
            for item in UserSessionActivity.objects.filter(user=user, session_date__gte=start_date, session_date__lte=today)
        }
        progress_by_day = {}
        for offset in range(7):
            day = start_date + timedelta(days=offset)
            seconds = session_rows.get(day, 0)
            progress_by_day[day.weekday()] = {
                "date": day.isoformat(),
                "day": day.strftime("%a"),
                "hours": round(seconds / 3600, 2),
            }
        study_progress = [
            progress_by_day.get(index, {"day": label, "hours": 0})
            for index, label in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
        ]

        recommendations = [
            {
                "title": item.title,
                "description": item.description,
                "url": item.url,
                "resource_type": item.resource_type,
                "source_name": item.source_name,
                "author_or_channel": item.author_or_channel,
                "published_date": item.published_date,
                "thumbnail": item.thumbnail,
            }
            for item in SavedResource.objects.filter(user=user, is_saved=True).order_by("-created_at")[:5]
            if item.url
        ]
        if len(recommendations) < 5:
            seen = {item["url"] for item in recommendations}
            for activity in ActivityLog.objects.filter(user=user, activity_type="resource_opened").order_by("-created_at")[:10]:
                url = activity.metadata.get("url")
                if not url or url in seen:
                    continue
                recommendations.append({
                    "title": activity.description.replace("You opened ", "").rstrip(".") or activity.title,
                    "description": activity.description,
                    "url": url,
                    "resource_type": activity.metadata.get("resource_type", "link"),
                    "source_name": activity.metadata.get("source_name", "Resource Hub"),
                    "author_or_channel": "",
                    "published_date": "",
                    "thumbnail": "",
                })
                seen.add(url)
                if len(recommendations) >= 5:
                    break

        data = {
            "active_courses": active_courses,
            "resource_results": resource_results,
            "pdf_documents": pdf_documents,
            "generated_outputs": generated_outputs,
            "login_days": [
                {"date": item.login_date.isoformat(), "count": item.login_count}
                for item in LoginActivity.objects.filter(user=user).order_by("login_date")
            ],
            "recent_activity": recent_activity,
            "recommended_resources": recommendations,
            "total_documents": pdf_documents,
            "total_flashcard_decks": flashcard_decks,
            "total_flashcards": Flashcard.objects.filter(deck__user=user).count(),
            "total_quizzes": quizzes,
            "total_saved_resources": SavedResource.objects.filter(user=user, is_saved=True).count(),
            "recommended_actions": [
                "Upload a recent lecture PDF",
                "Generate flashcards for your hardest course",
                "Take a short quiz before your next class",
                "Ask AI Advisor for a weekly study plan",
            ],
            "study_progress": study_progress,
        }
        return success_response("Dashboard summary fetched successfully", data)


class HeartbeatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        session = update_user_session(request.user)
        return success_response("Activity heartbeat recorded", {
            "session_date": session.session_date.isoformat() if session else None,
            "duration_seconds": session.duration_seconds if session else 0,
        })


class AdminSummaryView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        data = {
            "total_users": User.objects.count(),
            "total_students": User.objects.filter(role="student").count(),
            "total_admins": User.objects.filter(role="admin").count(),
            "total_documents": Document.objects.count(),
            "total_quizzes": Quiz.objects.count(),
            "total_flashcard_decks": FlashcardDeck.objects.count(),
        }
        return success_response("Admin summary fetched", data)


class AdminUsersView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        from apps.accounts.serializers import UserSerializer

        return success_response("Admin users fetched", UserSerializer(User.objects.all().order_by("-date_joined"), many=True).data)


class AdminDocumentsView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        from apps.documents.serializers import DocumentSerializer

        return success_response("Admin documents fetched", DocumentSerializer(Document.objects.select_related("user"), many=True, context={"request": request}).data)
