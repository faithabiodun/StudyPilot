from django.apps import AppConfig


class AdvisorConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.advisor"
    label = "advisor"

    def ready(self):
        from . import checks  # noqa: F401
