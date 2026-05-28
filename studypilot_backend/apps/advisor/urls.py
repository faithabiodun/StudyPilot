from django.urls import path

from .views import AdvisorChatView, ChatSessionDetailView, ChatSessionListCreateView

urlpatterns = [
    path("sessions/", ChatSessionListCreateView.as_view(), name="chat_sessions"),
    path("sessions/<int:pk>/", ChatSessionDetailView.as_view(), name="chat_session_detail"),
    path("chat/", AdvisorChatView.as_view(), name="advisor_chat"),
]
