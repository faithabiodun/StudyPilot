from rest_framework import serializers

from .models import ChatMessage, ChatSession


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ("id", "sender", "message", "created_at")


class ChatSessionSerializer(serializers.ModelSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)

    class Meta:
        model = ChatSession
        fields = ("id", "title", "messages", "created_at", "updated_at")
        read_only_fields = ("id", "messages", "created_at", "updated_at")


class CreateChatSessionSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=180, required=False, default="New academic chat")


class ChatRequestSerializer(serializers.Serializer):
    session_id = serializers.IntegerField(required=False)
    document_id = serializers.IntegerField(required=False)
    message = serializers.CharField()
