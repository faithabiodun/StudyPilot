from rest_framework import status
from rest_framework.response import Response


def success_response(message="Action completed successfully", data=None, status_code=status.HTTP_200_OK):
    return Response(
        {"success": True, "message": message, "data": data if data is not None else {}},
        status=status_code,
    )


def error_response(message="Error", errors=None, status_code=status.HTTP_400_BAD_REQUEST):
    return Response(
        {"success": False, "message": message, "errors": errors if errors is not None else {}},
        status=status_code,
    )
