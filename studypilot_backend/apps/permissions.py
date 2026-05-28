from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    message = "Admin role is required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "admin")


class IsOwner(BasePermission):
    message = "You can only access your own records."

    def has_object_permission(self, request, view, obj):
        return getattr(obj, "user_id", None) == request.user.id
