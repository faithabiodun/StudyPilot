from django.contrib import admin

from .models import SavedResource


@admin.register(SavedResource)
class SavedResourceAdmin(admin.ModelAdmin):
    list_display = ("title", "resource_type", "course_title", "user", "created_at")
    search_fields = ("title", "course_title", "user__email")
