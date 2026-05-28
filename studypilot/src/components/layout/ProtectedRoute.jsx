import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function ProtectedRoute({ allowedRole, requireProfile = true }) {
  const location = useLocation();
  const { isAuthenticated, role, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && role !== allowedRole) {
    return <Navigate to="/student/dashboard" replace />;
  }

  if (requireProfile && allowedRole === "student" && user && !user.profile_completed) {
    return <Navigate to="/onboarding" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}
