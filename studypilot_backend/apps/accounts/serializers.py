from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    first_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "full_name",
            "first_name",
            "email",
            "role",
            "profile_completed",
            "matric_number",
            "faculty",
            "department",
            "level",
            "semester",
            "institution",
            "current_courses",
            "academic_goal",
            "weak_courses",
            "preferred_learning_style",
            "preferred_resource_types",
            "study_hours_per_week",
            "exam_preparation_focus",
            "career_interest",
            "avatar",
            "date_joined",
        )
        read_only_fields = ("id", "email", "role", "date_joined", "first_name")

    def get_first_name(self, obj):
        if obj.full_name:
            return obj.full_name.strip().split()[0]
        if obj.email:
            return obj.email.split("@")[0]
        return "Student"


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.STUDENT, required=False)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already exists.")
        return value.lower()

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Password mismatch."})
        validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class GoogleAuthSerializer(serializers.Serializer):
    credential = serializers.CharField(required=False)
    id_token = serializers.CharField(required=False)

    def validate(self, attrs):
        if not attrs.get("credential") and not attrs.get("id_token"):
            raise serializers.ValidationError("Google credential or id_token is required.")
        return attrs


class SupabaseGoogleAuthSerializer(serializers.Serializer):
    access_token = serializers.CharField()


class OnboardingSerializer(serializers.ModelSerializer):
    required_fields = (
        "institution",
        "department",
        "level",
        "semester",
        "current_courses",
        "academic_goal",
        "preferred_learning_style",
        "preferred_resource_types",
    )

    class Meta:
        model = User
        fields = (
            "matric_number",
            "institution",
            "faculty",
            "department",
            "level",
            "semester",
            "current_courses",
            "academic_goal",
            "weak_courses",
            "preferred_learning_style",
            "preferred_resource_types",
            "study_hours_per_week",
            "exam_preparation_focus",
            "career_interest",
        )

    def validate(self, attrs):
        errors = {}
        for field in self.required_fields:
            value = attrs.get(field)
            if value in (None, "", []):
                errors[field] = "This field is required."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.profile_completed = True
        instance.save()
        return instance


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "full_name",
            "matric_number",
            "institution",
            "faculty",
            "department",
            "level",
            "semester",
            "current_courses",
            "academic_goal",
            "weak_courses",
            "preferred_learning_style",
            "preferred_resource_types",
            "study_hours_per_week",
            "exam_preparation_focus",
            "career_interest",
            "avatar",
        )

    def validate_current_courses(self, value):
        if value in (None, ""):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Current courses must be a list.")
        cleaned = []
        seen = set()
        for item in value:
            if isinstance(item, str):
                code = ""
                title = item.strip()
            elif isinstance(item, dict):
                code = str(item.get("code") or "").strip().upper()
                title = str(item.get("title") or "").strip()
            else:
                raise serializers.ValidationError("Each course must be an object with code and title.")
            if not title:
                raise serializers.ValidationError("Course title cannot be empty.")
            key = (code or title).lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append({"code": code, "title": title})
        return cleaned
