from django.db import migrations, models


def clear_unchosen_usernames(apps, schema_editor):
    """Blank out usernames nobody actually picked.

    The old create_user copied the email into username, so existing rows hold
    an address rather than a chosen handle. Those, and the empty strings that
    would violate the new unique constraint, become NULL so the account is
    prompted to choose one on next sign-in.
    """
    User = apps.get_model("accounts", "User")
    User.objects.filter(username="").update(username=None)
    for user in User.objects.exclude(username=None).iterator():
        if user.username.strip().lower() == (user.email or "").strip().lower():
            User.objects.filter(pk=user.pk).update(username=None)


def noop(apps, schema_editor):
    """Nothing to restore: the previous values were never user-chosen."""


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_suiloginchallenge_user_sui_address"),
    ]

    operations = [
        # Allow NULL first so the data step can clear duplicates, and only then
        # add the unique constraint.
        migrations.AlterField(
            model_name="user",
            name="username",
            field=models.CharField(blank=True, max_length=150, null=True),
        ),
        migrations.RunPython(clear_unchosen_usernames, noop),
        migrations.AlterField(
            model_name="user",
            name="username",
            field=models.CharField(blank=True, max_length=150, null=True, unique=True),
        ),
    ]
