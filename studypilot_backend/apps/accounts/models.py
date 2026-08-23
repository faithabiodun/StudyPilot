from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, username=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("full_name", "StudyPilot Admin")

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        ADMIN = "admin", "Admin"

    username = models.CharField(max_length=150, blank=True)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    profile_completed = models.BooleanField(default=False)
    matric_number = models.CharField(max_length=80, blank=True)
    faculty = models.CharField(max_length=160, blank=True)
    department = models.CharField(max_length=120, blank=True)
    level = models.CharField(max_length=50, blank=True)
    semester = models.CharField(max_length=80, blank=True)
    institution = models.CharField(max_length=160, blank=True)
    current_courses = models.JSONField(default=list, blank=True)
    academic_goal = models.JSONField(default=list, blank=True)
    weak_courses = models.JSONField(default=list, blank=True)
    preferred_learning_style = models.CharField(max_length=120, blank=True)
    preferred_resource_types = models.JSONField(default=list, blank=True)
    study_hours_per_week = models.PositiveSmallIntegerField(null=True, blank=True)
    exam_preparation_focus = models.CharField(max_length=255, blank=True)
    career_interest = models.CharField(max_length=255, blank=True)
    avatar = models.URLField(blank=True)
    google_id = models.CharField(max_length=255, blank=True, db_index=True)
    supabase_user_id = models.CharField(max_length=255, blank=True, db_index=True)
    is_google_account = models.BooleanField(default=False)
    # Canonical 0x-prefixed 32-byte address. Unique so one wallet maps to one
    # account, but nullable because most users never connect a wallet and
    # several blank strings would collide under a unique constraint.
    sui_address = models.CharField(max_length=66, unique=True, null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email


class SuiLoginChallenge(models.Model):
    """A one-time nonce a wallet must sign.

    Kept in the database rather than the default local-memory cache: gunicorn
    runs multiple workers, so a nonce issued by one worker would be invisible to
    the worker that handles the verification request.
    """

    nonce = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.nonce
