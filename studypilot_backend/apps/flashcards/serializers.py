from rest_framework import serializers

from .models import Flashcard, FlashcardDeck


class FlashcardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Flashcard
        fields = ("id", "question", "answer", "created_at")
        read_only_fields = ("id", "created_at")


class FlashcardDeckSerializer(serializers.ModelSerializer):
    cards = FlashcardSerializer(many=True, read_only=True)
    card_count = serializers.IntegerField(source="cards.count", read_only=True)

    class Meta:
        model = FlashcardDeck
        fields = ("id", "document", "course_title", "title", "description", "card_count", "cards", "created_at", "updated_at")
        read_only_fields = ("id", "card_count", "cards", "created_at", "updated_at")


class GenerateFlashcardsSerializer(serializers.Serializer):
    document_id = serializers.IntegerField()
    course_title = serializers.CharField(max_length=180, required=False, allow_blank=True, default="")
    number_of_cards = serializers.ChoiceField(choices=[10, 20, 30], default=10)
    difficulty = serializers.CharField(max_length=40, default="medium")

    def validate_difficulty(self, value):
        value = (value or "").lower()
        if value not in {"easy", "medium", "hard"}:
            raise serializers.ValidationError("Difficulty must be easy, medium, or hard.")
        return value

    def validate_number_of_cards(self, value):
        return int(value)
