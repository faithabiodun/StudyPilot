import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { API_BASE_URL, apiRequest } from "./api";

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    fullName: user.full_name || user.fullName || "StudyPilot Student",
    avatar: user.avatar || "",
    role: user.role || "student"
  };
}

export function persistAuthPayload(payload) {
  const data = payload?.data || payload;
  if (!data?.access || !data?.refresh || !data?.user) {
    throw new Error("Invalid authentication response");
  }
  localStorage.setItem("studypilot_access_token", data.access);
  localStorage.setItem("studypilot_refresh_token", data.refresh);
  localStorage.setItem("studypilot_user", JSON.stringify(normalizeUser(data.user)));
  return normalizeUser(data.user);
}

export function clearAuthStorage() {
  localStorage.removeItem("studypilot_access_token");
  localStorage.removeItem("studypilot_refresh_token");
  localStorage.removeItem("studypilot_user");
}

export function getStoredUser() {
  try {
    return normalizeUser(JSON.parse(localStorage.getItem("studypilot_user")));
  } catch {
    return null;
  }
}

export async function loginWithEmail(payload) {
  const response = await apiRequest("/auth/login/", {
    skipAuth: true,
    method: "POST",
    body: JSON.stringify(payload)
  });
  return persistAuthPayload(response);
}

export async function registerWithEmail(payload) {
  const response = await apiRequest("/auth/register/", {
    skipAuth: true,
    method: "POST",
    body: JSON.stringify({
      full_name: payload.fullName,
      email: payload.email,
      password: payload.password,
      confirm_password: payload.confirmPassword,
      role: payload.role || "student"
    })
  });
  return persistAuthPayload(response);
}

export async function completeOnboarding(payload) {
  const response = await apiRequest("/auth/complete-onboarding/", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return persistAuthPayload({ data: {
    access: localStorage.getItem("studypilot_access_token"),
    refresh: localStorage.getItem("studypilot_refresh_token"),
    user: response.data
  }});
}

export async function updateProfile(payload) {
  const response = await apiRequest("/auth/profile/", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return persistAuthPayload({ data: {
    access: localStorage.getItem("studypilot_access_token"),
    refresh: localStorage.getItem("studypilot_refresh_token"),
    user: response.data
  }});
}

export async function signInWithGoogle() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase Auth is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` }
  });
  if (error) throw error;
}

export async function checkBackendHealth() {
  const endpoint = `${API_BASE_URL}/health/`;
  if (import.meta.env.DEV) {
    console.log("StudyPilot API base URL", API_BASE_URL);
    console.log("Health endpoint request started", endpoint);
  }

  let response;
  try {
    response = await fetch(endpoint, { method: "GET" });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.log("Health endpoint request failed");
    }
    throw new Error("Could not reach StudyPilot backend. Check that VITE_API_BASE_URL points to a running backend.");
  }

  if (!response.ok) {
    if (import.meta.env.DEV) {
      console.log("Health endpoint request failed", response.status);
    }
    throw new Error(`StudyPilot backend health check failed with ${response.status}.`);
  }

  if (import.meta.env.DEV) {
    console.log("Health endpoint request succeeded");
  }

  return response.json();
}

export async function exchangeSupabaseGoogleToken(accessToken) {
  const endpoint = `${API_BASE_URL}/auth/supabase-google/`;
  if (import.meta.env.DEV) {
    console.log("Django OAuth API URL", endpoint);
    console.log("Django OAuth exchange request sent");
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken })
    });
  } catch (error) {
    throw new Error(`Could not reach StudyPilot backend at ${API_BASE_URL || "the configured API URL"}.`);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const fieldErrors = payload?.errors || {};
    const firstFieldError = Object.values(fieldErrors).flat?.()[0] || fieldErrors.access_token || fieldErrors.non_field_errors;
    const detail = Array.isArray(firstFieldError) ? firstFieldError[0] : firstFieldError;
    throw new Error(detail || payload?.message || payload?.detail || `Google sign in failed with ${response.status}.`);
  }

  if (import.meta.env.DEV) {
    console.log("Django OAuth exchange response received");
  }
  return persistAuthPayload(payload);
}

export async function signOutEverywhere() {
  try {
    await apiRequest("/documents/cleanup-temp/", { method: "POST" });
  } catch (error) {
    console.error("StudyPilot cleanup failed before logout:", error);
  }
  try {
    await supabase.auth.signOut();
  } catch {
    // Normal email/password users may not have a Supabase session.
  }
  clearAuthStorage();
}
