from rest_framework import serializers

from .models import SavedResource


class ResourceRecommendationSerializer(serializers.Serializer):
    title = serializers.CharField()
    resource_type = serializers.CharField()
    description = serializers.CharField()
    url = serializers.URLField()
    source_name = serializers.CharField(required=False, allow_blank=True)
    author_or_channel = serializers.CharField(required=False, allow_blank=True)
    published_date = serializers.CharField(required=False, allow_blank=True)
    thumbnail = serializers.URLField(required=False, allow_blank=True, allow_null=True)


class SavedResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedResource
        fields = ("id", "title", "resource_type", "description", "url", "course_title", "source_name", "author_or_channel", "published_date", "thumbnail", "is_saved", "created_at")
        read_only_fields = ("id", "created_at")


class SaveResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedResource
        fields = ("title", "resource_type", "description", "url", "course_title", "source_name", "author_or_channel", "published_date", "thumbnail", "is_saved")
