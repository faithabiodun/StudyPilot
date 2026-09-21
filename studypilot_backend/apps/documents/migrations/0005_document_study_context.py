from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0004_document_focused_end_page_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="document",
            name="study_context",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="document",
            name="study_context_retry",
            field=models.TextField(blank=True, default=""),
        ),
    ]
