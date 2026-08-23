from rest_framework import serializers

from .models import Quiz, QuizOption, QuizQuestion


class QuizOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizOption
        fields = ("id", "option_text", "is_correct")


class QuizQuestionSerializer(serializers.ModelSerializer):
    options = QuizOptionSerializer(many=True, read_only=True)

    class Meta:
        model = QuizQuestion
        fields = ("id", "question", "correct_answer", "explanation", "question_type", "subtopic", "options")


class QuizSerializer(serializers.ModelSerializer):
    questions = QuizQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = Quiz
        fields = ("id", "document", "course_title", "difficulty", "question_type", "number_of_questions", "questions", "created_at")


class GenerateQuizSerializer(serializers.Serializer):
    course_title = serializers.CharField(max_length=180, required=False, allow_blank=True, default="")
    difficulty = serializers.CharField(max_length=40, default="medium")
    question_types = serializers.ListField(child=serializers.CharField(), required=False, default=["multiple_choice"])
    number_of_questions = serializers.ChoiceField(choices=[10, 20, 30], default=10)
    document_id = serializers.IntegerField()

    def validate_difficulty(self, value):
        value = (value or "").lower()
        if value not in {"easy", "medium", "hard"}:
            raise serializers.ValidationError("Difficulty must be easy, medium, or hard.")
        return value

    def validate_question_types(self, value):
        allowed = {"multiple_choice", "true_false", "short_answer", "theory"}
        cleaned = [item for item in value if item in allowed]
        if not cleaned:
            raise serializers.ValidationError("Choose at least one supported question type.")
        return cleaned

    def validate_number_of_questions(self, value):
        return int(value)


class GenerateMCQSerializer(serializers.Serializer):
    document_id = serializers.IntegerField()
    course_title = serializers.CharField(max_length=180, required=False, allow_blank=True, default="")
    difficulty = serializers.CharField(max_length=40, default="medium")
    number_of_questions = serializers.ChoiceField(choices=[10, 20, 30], default=10)
    show_explanations = serializers.BooleanField(default=True)

    def validate_difficulty(self, value):
        value = (value or "").lower()
        if value not in {"easy", "medium", "hard"}:
            raise serializers.ValidationError("Difficulty must be easy, medium, or hard.")
        return value

    def validate_number_of_questions(self, value):
        return int(value)


class SubmitQuizSerializer(serializers.Serializer):
    answers = serializers.DictField(child=serializers.CharField(), help_text="Map question id to selected answer text")
