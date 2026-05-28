from django.urls import path

from .views import DashboardSummaryView, HeartbeatView

urlpatterns = [
    path("summary/", DashboardSummaryView.as_view(), name="dashboard_summary"),
    path("heartbeat/", HeartbeatView.as_view(), name="dashboard_heartbeat"),
]
