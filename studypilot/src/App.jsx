import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import AuthLayout from "./layouts/AuthLayout";
import StudentLayout from "./layouts/StudentLayout";
import LandingPage from "./pages/public/LandingPage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import AuthCallbackPage from "./pages/auth/AuthCallbackPage";
import StudentDashboard from "./pages/student/StudentDashboard";
import AIAdvisorPage from "./pages/student/AIAdvisorPage";
import PDFStudioPage from "./pages/student/PDFStudioPage";
import YouTubeStudioPage from "./pages/student/YouTubeStudioPage";
import ResourceHubPage from "./pages/student/ResourceHubPage";
import ProfilePage from "./pages/student/ProfilePage";
import OnboardingPage from "./pages/student/OnboardingPage";

function FallbackRoute() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<Navigate to="/student/dashboard" replace />} />
      <Route path="/ai-advisor" element={<Navigate to="/student/ai-advisor" replace />} />
      <Route path="/pdf-studio" element={<Navigate to="/student/pdf-studio" replace />} />
      <Route path="/flashcards" element={<Navigate to="/pdf-studio" replace />} />
      <Route path="/quiz-lab" element={<Navigate to="/pdf-studio" replace />} />
      <Route path="/resource-hub" element={<Navigate to="/student/resource-hub" replace />} />
      <Route path="/youtube-to-docx" element={<Navigate to="/student/youtube-to-docx" replace />} />
      <Route path="/saved-library" element={<Navigate to="/dashboard" replace />} />
      <Route path="/profile" element={<Navigate to="/student/profile" replace />} />
      <Route path="/settings" element={<Navigate to="/profile" replace />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<ProtectedRoute allowedRole="student" requireProfile={false} />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
      </Route>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRole="student" />}>
        <Route path="/student" element={<StudentLayout />}>
          <Route index element={<Navigate to="/student/dashboard" replace />} />
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route path="ai-advisor" element={<AIAdvisorPage />} />
          <Route path="pdf-studio" element={<PDFStudioPage />} />
          <Route path="flashcards" element={<Navigate to="/student/pdf-studio" replace />} />
          <Route path="quiz-lab" element={<Navigate to="/student/pdf-studio" replace />} />
          <Route path="resource-hub" element={<ResourceHubPage />} />
          <Route path="youtube-to-docx" element={<YouTubeStudioPage />} />
          <Route path="saved-library" element={<Navigate to="/student/dashboard" replace />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<Navigate to="/student/profile" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<FallbackRoute />} />
    </Routes>
  );
}
