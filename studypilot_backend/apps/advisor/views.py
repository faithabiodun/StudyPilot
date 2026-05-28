from django.shortcuts import get_object_or_404
from django.core.exceptions import ImproperlyConfigured
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.dashboard.services import record_activity
from apps.utils import error_response, success_response
from apps.ai.services import AIServiceError

from .models import ChatMessage, ChatSession
from .serializers import ChatRequestSerializer, ChatSessionSerializer, CreateChatSessionSerializer
from .services import generate_advisor_response


class ChatSessionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = ChatSession.objects.filter(user=request.user).prefetch_related("messages")
        return success_response("Chat sessions fetched", ChatSessionSerializer(sessions, many=True).data)

    def post(self, request):
        serializer = CreateChatSessionSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Chat session creation failed", serializer.errors)
        session = ChatSession.objects.create(user=request.user, title=serializer.validated_data["title"])
        return success_response("Chat session created", ChatSessionSerializer(session).data, status.HTTP_201_CREATED)


class ChatSessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        session = get_object_or_404(ChatSession.objects.prefetch_related("messages"), pk=pk, user=request.user)
        return success_response("Chat session fetched", ChatSessionSerializer(session).data)


class AdvisorChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Chat request failed", serializer.errors)

        session_id = serializer.validated_data.get("session_id")
        document_id = serializer.validated_data.get("document_id")
        message = serializer.validated_data["message"]
        if session_id:
            session = get_object_or_404(ChatSession, pk=session_id, user=request.user)
        else:
            session = ChatSession.objects.create(user=request.user, title=message[:80])

        user_message = ChatMessage.objects.create(session=session, sender=ChatMessage.Sender.USER, message=message)
        try:
            advisor_data = generate_advisor_response(request.user, message, document_id=document_id)
        except ImproperlyConfigured as exc:
            return error_response(str(exc), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except AIServiceError as exc:
            return error_response(str(exc) or "Advisor service failed to generate a response.", status_code=status.HTTP_502_BAD_GATEWAY)
        except Exception:
            return error_response("Advisor service failed to generate a response.", status_code=status.HTTP_502_BAD_GATEWAY)

        assistant_message = ChatMessage.objects.create(session=session, sender=ChatMessage.Sender.ASSISTANT, message=advisor_data["response"])

        session.save(update_fields=["updated_at"])
        record_activity(request.user, "advisor_question", "Asked AI Advisor", f"You asked: {message[:120]}", {"session_id": session.id})
        return success_response("Advisor response generated successfully", {
            **advisor_data,
            "session_id": session.id,
            "user_message_id": user_message.id,
            "assistant_message_id": assistant_message.id,
        })
