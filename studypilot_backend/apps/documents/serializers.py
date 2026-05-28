from pathlib import Path

from django.conf import settings
from rest_framework import serializers

from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    extracted_text_length = serializers.SerializerMethodField()
    focused_extracted_text_length = serializers.SerializerMethodField()
    chunk_count = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = (
            "id",
            "title",
            "original_filename",
            "file",
            "file_url",
            "file_type",
            "file_size",
            "page_count",
            "total_page_count",
            "focused_start_page",
            "focused_end_page",
            "extracted_text",
            "focused_extracted_text",
            "extracted_text_length",
            "focused_extracted_text_length",
            "chunk_count",
            "status",
            "uploaded_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "original_filename",
            "file_url",
            "file_type",
            "file_size",
            "page_count",
            "total_page_count",
            "focused_start_page",
            "focused_end_page",
            "extracted_text",
            "focused_extracted_text",
            "extracted_text_length",
            "focused_extracted_text_length",
            "chunk_count",
            "status",
            "uploaded_at",
            "updated_at",
        )

    def get_file_url(self, obj):
        request = self.context.get("request")
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url if obj.file else ""

    def get_extracted_text_length(self, obj):
        return len(obj.extracted_text or "")

    def get_focused_extracted_text_length(self, obj):
        return len(obj.focused_extracted_text or "")

    def get_chunk_count(self, obj):
        return obj.chunks.count()


class DocumentUploadSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    file = serializers.FileField()

    def validate_file(self, file):
        extension = Path(file.name).suffix.lower()
        if extension != ".pdf":
            raise serializers.ValidationError("Only readable PDF files are supported by PDF Study Converter.")
        if file.size > settings.MAX_UPLOAD_SIZE:
            limit_mb = settings.MAX_UPLOAD_SIZE // (1024 * 1024)
            raise serializers.ValidationError(f"File size exceeds {limit_mb}MB limit.")
        return file
