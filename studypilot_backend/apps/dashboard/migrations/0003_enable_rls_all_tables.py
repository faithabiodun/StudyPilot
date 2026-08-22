from django.db import migrations

# All 26 application tables that previously had RLS disabled.
# The backend connects as the postgres superuser via a direct connection string,
# which bypasses RLS — enabling it here closes anon-key exposure with zero
# functional risk. The frontend anon key is used only for Supabase Auth
# (/auth/v1/*) and never queries PostgREST directly.
TABLES = [
    "django_migrations",
    "django_content_type",
    "django_admin_log",
    "django_session",
    "auth_permission",
    "auth_group",
    "auth_group_permissions",
    "accounts_user",
    "accounts_user_groups",
    "accounts_user_user_permissions",
    "academics_course",
    "advisor_chatsession",
    "advisor_chatmessage",
    "documents_document",
    "documents_documentchunk",
    "flashcards_flashcarddeck",
    "flashcards_flashcard",
    "quizzes_quiz",
    "quizzes_quizquestion",
    "quizzes_quizoption",
    "resources_savedresource",
    "token_blacklist_blacklistedtoken",
    "token_blacklist_outstandingtoken",
    "dashboard_activitylog",
    "dashboard_loginactivity",
    "dashboard_usersessionactivity",
]

_enable_sql = "\n".join(
    f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY;" for t in TABLES
)
_disable_sql = "\n".join(
    f"ALTER TABLE {t} DISABLE ROW LEVEL SECURITY;" for t in TABLES
)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_user_academic_goal_user_career_interest_and_more"),
        ("academics", "0001_initial"),
        ("advisor", "0001_initial"),
        ("documents", "0004_document_focused_end_page_and_more"),
        ("flashcards", "0002_alter_flashcarddeck_course_title"),
        ("quizzes", "0002_alter_quiz_course_title"),
        ("resources", "0002_savedresource_author_or_channel_and_more"),
        ("dashboard", "0002_usersessionactivity"),
        ("token_blacklist", "0013_alter_blacklistedtoken_options_and_more"),
    ]

    operations = [
        migrations.RunSQL(
            sql=_enable_sql,
            reverse_sql=_disable_sql,
        ),
    ]
