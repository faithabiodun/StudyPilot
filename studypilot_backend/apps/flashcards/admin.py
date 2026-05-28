from django.contrib import admin

from .models import Flashcard, FlashcardDeck


class FlashcardInline(admin.TabularInline):
    model = Flashcard
    extra = 0


@admin.register(FlashcardDeck)
class FlashcardDeckAdmin(admin.ModelAdmin):
    list_display = ("title", "course_title", "user", "created_at")
    search_fields = ("title", "course_title", "user__email")
    inlines = [FlashcardInline]


@admin.register(Flashcard)
class FlashcardAdmin(admin.ModelAdmin):
    list_display = ("question", "deck", "created_at")
    search_fields = ("question", "answer")
