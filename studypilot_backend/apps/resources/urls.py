from django.urls import path

from .views import RecommendationsView, SaveResourceView, SavedResourceDeleteView, SavedResourceListView, TrackResourceOpenView

urlpatterns = [
    path("recommendations/", RecommendationsView.as_view(), name="resource_recommendations"),
    path("save/", SaveResourceView.as_view(), name="save_resource"),
    path("track-open/", TrackResourceOpenView.as_view(), name="track_resource_open"),
    path("saved/", SavedResourceListView.as_view(), name="saved_resources"),
    path("saved/<int:pk>/", SavedResourceDeleteView.as_view(), name="delete_saved_resource"),
]
