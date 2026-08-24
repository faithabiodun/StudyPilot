"""Settings for running the test suite.

Tests must not touch the production database. The default DATABASE_URL points
at Supabase through the Supavisor pooler, which keeps connections alive, so
Django cannot drop and recreate its test database between runs. An in-memory
SQLite database is faster and needs no credentials.

Usage:
    python manage.py test --settings=config.settings_test
"""
from .settings import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Hashing dominates the runtime of any test that creates a user.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Nothing in the suite should reach the relayer; the mock client is used
# instead, and every call site is patched.
MEMWAL_ENABLED = False
