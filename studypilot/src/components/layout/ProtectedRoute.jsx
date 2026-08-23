import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function ProtectedRoute({ allowedRole, requireProfile = true, requireUsername = true }) {
  const location = useLocation();
  const { isAuthenticated, role, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && role !== allowedRole) {
    return <Navigate to="/student/dashboard" replace />;
  }

  // Wallet and Google sign-ups arrive with no handle to borrow. Ask for one
  // before anything else, including onboarding, so the greeting is never a
  // placeholder like "Sui Wallet 0x760f...".
  if (requireUsername && user && !user.username) {
    return <Navigate to="/choose-username" replace />;
  }

  if (requireProfile && allowedRole === "student" && user && !user.profile_completed) {
    return <Navigate to="/onboarding" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}
