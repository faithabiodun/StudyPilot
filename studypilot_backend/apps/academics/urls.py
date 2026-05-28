from django.urls import path

from .views import CourseListCreateView

urlpatterns = [
    path("courses/", CourseListCreateView.as_view(), name="courses"),
]
