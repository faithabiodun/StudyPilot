from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.dashboard.services import record_activity
from apps.memory.services import remember_material
from apps.documents.services import clean_safe_string
from apps.utils import error_response, success_response

from .models import SavedResource
from .serializers import SaveResourceSerializer, SavedResourceSerializer
from .services import get_combined_recommendations, normalize_type


class RecommendationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = clean_safe_string(
            request.query_params.get("q") or request.query_params.get("topic") or request.query_params.get("course_title") or "",
            max_length=220,
        )
        resource_type = normalize_type(request.query_params.get("type", "all"))
        data = get_combined_recommendations(query, resource_type)
        record_activity(
            request.user,
            "resource_search",
            "Searched Resource Hub",
            f"You searched {resource_type} resources for {query or 'study resources'}.",
            {"query": query, "type": resource_type, "results_count": data.get("count", 0)},
        )
        # Only worth remembering if the student typed something real and it
        # found matches; partial words on the way to a query are noise.
        if len(query) >= 3 and data.get("count", 0) > 0:
            remember_material(
                request.user,
                source_type="search",
                title=f"Looked for {resource_type} resources on {query}",
                topic=query,
                summary=f"{data.get('count', 0)} results",
            )
        return success_response("Resources fetched successfully", data)


class SaveResourceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SaveResourceSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Resource save failed", serializer.errors)
        cleaned = {
            "title": clean_safe_string(serializer.validated_data.get("title", ""), fallback="Saved Resource", max_length=220),
            "resource_type": clean_safe_string(serializer.validated_data.get("resource_type", ""), fallback="link", max_length=20),
            "description": clean_safe_string(serializer.validated_data.get("description", "")),
            "url": clean_safe_string(serializer.validated_data.get("url", ""), max_length=500),
            "course_title": clean_safe_string(serializer.validated_data.get("course_title", ""), max_length=180),
            "source_name": clean_safe_string(serializer.validated_data.get("source_name", ""), max_length=120),
            "author_or_channel": clean_safe_string(serializer.validated_data.get("author_or_channel", ""), max_length=220),
            "published_date": clean_safe_string(serializer.validated_data.get("published_date", ""), max_length=80),
            "thumbnail": clean_safe_string(serializer.validated_data.get("thumbnail", ""), max_length=500),
            "is_saved": True,
        }
        resource, created = SavedResource.objects.update_or_create(
            user=request.user,
            url=cleaned["url"],
            defaults=cleaned,
        )
        record_activity(
            request.user,
            "resource_saved",
            "Saved Resource",
            f"You saved {cleaned['title']}.",
            {"url": cleaned["url"], "resource_type": cleaned["resource_type"]},
        )
        remember_material(
            request.user,
            source_type="saved",
            title=cleaned["title"],
            topic=cleaned["course_title"] or cleaned["title"],
            summary=cleaned["description"][:200],
            reference=cleaned["url"],
        )
        return success_response("Resource saved", SavedResourceSerializer(resource).data, status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class TrackResourceOpenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        title = clean_safe_string(request.data.get("title", ""), fallback="Learning resource", max_length=220)
        resource_type = clean_safe_string(request.data.get("resource_type", ""), fallback="link", max_length=40)
        url = clean_safe_string(request.data.get("url", ""), max_length=500)
        source_name = clean_safe_string(request.data.get("source_name", ""), max_length=120)
        if not url:
            return error_response("Resource tracking failed", {"url": "Resource URL is required."}, status.HTTP_400_BAD_REQUEST)
        record_activity(
            request.user,
            "resource_opened",
            "Opened Resource",
            f"You opened {title}.",
            {"url": url, "resource_type": resource_type, "source_name": source_name},
        )
        remember_material(
            request.user,
            source_type="opened",
            title=title,
            summary=f"{resource_type} from {source_name}" if source_name else resource_type,
            reference=url,
        )
        return success_response("Resource open tracked", {"tracked": True})


class SavedResourceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        resources = SavedResource.objects.filter(user=request.user, is_saved=True)
        return success_response("Saved resources fetched", SavedResourceSerializer(resources, many=True).data)


class SavedResourceDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        resource = get_object_or_404(SavedResource, pk=pk, user=request.user)
        resource.delete()
        return success_response("Saved resource deleted")
