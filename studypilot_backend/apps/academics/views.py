from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.permissions import IsAdminRole
from apps.utils import error_response, success_response

from .models import Course
from .serializers import CourseSerializer


class CourseListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_response("Courses fetched", CourseSerializer(Course.objects.all(), many=True).data)

    def post(self, request):
        if request.user.role != "admin":
            return error_response("Permission denied", status_code=403)
        serializer = CourseSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Course creation failed", serializer.errors)
        serializer.save()
        return success_response("Course created", serializer.data, status_code=201)
