from django.contrib import admin

from .models import ActivityLog, LoginActivity, UserSessionActivity


@admin.register(LoginActivity)
class LoginActivityAdmin(admin.ModelAdmin):
    list_display = ("user", "login_date", "login_count", "updated_at")
    search_fields = ("user__email",)
    list_filter = ("login_date",)


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("user", "activity_type", "title", "created_at")
    search_fields = ("user__email", "title", "description")
    list_filter = ("activity_type", "created_at")


@admin.register(UserSessionActivity)
class UserSessionActivityAdmin(admin.ModelAdmin):
    list_display = ("user", "session_date", "started_at", "last_seen_at", "duration_seconds")
    search_fields = ("user__email",)
    list_filter = ("session_date",)
