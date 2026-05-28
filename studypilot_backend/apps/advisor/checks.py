from django.conf import settings
from django.core.checks import register


@register()
def deepseek_environment_check(app_configs, **kwargs):
    print(f"DeepSeek key loaded: {'yes' if settings.DEEPSEEK_KEY_LOADED else 'no'}")
    return []
