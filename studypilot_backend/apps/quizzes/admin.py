from django.contrib import admin

from .models import Quiz, QuizOption, QuizQuestion


class QuizOptionInline(admin.TabularInline):
    model = QuizOption
    extra = 0


class QuizQuestionInline(admin.StackedInline):
    model = QuizQuestion
    extra = 0


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ("course_title", "difficulty", "user", "created_at")
    search_fields = ("course_title", "user__email")
    inlines = [QuizQuestionInline]


@admin.register(QuizQuestion)
class QuizQuestionAdmin(admin.ModelAdmin):
    inlines = [QuizOptionInline]
