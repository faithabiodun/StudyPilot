from django.urls import path

from .views import AdminDocumentsView, AdminSummaryView, AdminUsersView

urlpatterns = [
    path("summary/", AdminSummaryView.as_view(), name="admin_summary"),
    path("users/", AdminUsersView.as_view(), name="admin_users"),
    path("documents/", AdminDocumentsView.as_view(), name="admin_documents"),
]
