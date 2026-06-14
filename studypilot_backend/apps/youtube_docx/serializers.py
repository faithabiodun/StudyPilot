from rest_framework import serializers

DIFFICULTIES = {"easy", "medium", "hard"}
QUESTION_TYPES = {"multiple_choice", "true_false", "short_answer", "theory"}


class _BaseYoutubeSerializer(serializers.Serializer):
    youtube_url = serializers.CharField(max_length=500)
    difficulty = serializers.CharField(max_length=40, default="medium")

    def validate_youtube_url(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Paste a YouTube link.")
        if "youtu" not in value.lower() and len(value) != 11:
            raise serializers.ValidationError("Enter a valid YouTube video link.")
        return value

    def validate_difficulty(self, value):
        value = (value or "medium").lower()
        if value not in DIFFICULTIES:
            raise serializers.ValidationError("Difficulty must be easy, medium, or hard.")
        return value


class YoutubeDocxSerializer(_BaseYoutubeSerializer):
    detail_level = serializers.ChoiceField(
        choices=["concise", "comprehensive", "detailed"], default="comprehensive"
    )
    document_style = serializers.ChoiceField(
        choices=["study_guide", "lecture_notes", "summary"], default="study_guide"
    )
    custom_instruction = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default=""
    )


class YoutubeFlashcardsSerializer(_BaseYoutubeSerializer):
    number_of_cards = serializers.ChoiceField(choices=[10, 20, 30], default=10)

    def validate_number_of_cards(self, value):
        return int(value)


class YoutubeMCQSerializer(_BaseYoutubeSerializer):
    number_of_questions = serializers.ChoiceField(choices=[10, 20, 30], default=10)

    def validate_number_of_questions(self, value):
        return int(value)


class YoutubeQuizSerializer(_BaseYoutubeSerializer):
    number_of_questions = serializers.ChoiceField(choices=[10, 20, 30], default=10)
    question_types = serializers.ListField(
        child=serializers.CharField(), required=False, default=["multiple_choice"]
    )

    def validate_number_of_questions(self, value):
        return int(value)

    def validate_question_types(self, value):
        cleaned = [item for item in value if item in QUESTION_TYPES]
        if not cleaned:
            raise serializers.ValidationError("Choose at least one supported question type.")
        return cleaned
