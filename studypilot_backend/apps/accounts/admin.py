from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class StudyPilotUserAdmin(UserAdmin):
    model = User
    list_display = ("email", "full_name", "role", "is_staff", "is_google_account", "date_joined")
    list_filter = ("role", "is_staff", "is_google_account")
    search_fields = ("email", "full_name")
    ordering = ("email",)
    fieldsets = UserAdmin.fieldsets + (
        ("StudyPilot Profile", {"fields": ("full_name", "role", "department", "level", "institution", "avatar", "google_id", "is_google_account")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "full_name", "role", "password1", "password2"),
        }),
    )
