from django.urls import path

from .views import CleanupTempDocumentsView, DocumentDetailView, DocumentListView, DocumentUploadView, ExtractTextView

urlpatterns = [
    path("", DocumentListView.as_view(), name="documents"),
    path("upload/", DocumentUploadView.as_view(), name="document_upload"),
    path("cleanup-temp/", CleanupTempDocumentsView.as_view(), name="document_cleanup_temp"),
    path("<int:pk>/", DocumentDetailView.as_view(), name="document_detail"),
    path("<int:pk>/extract-text/", ExtractTextView.as_view(), name="document_extract_text"),
]
