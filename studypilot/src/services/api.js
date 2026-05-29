export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function apiRequest(path, options = {}, fallback) {
  try {
    if (!API_BASE_URL) {
      throw new Error("StudyPilot API URL is not configured. Set VITE_API_BASE_URL.");
    }
    const { skipAuth = false, ...fetchOptions } = options;
    const token = skipAuth ? "" : localStorage.getItem("studypilot_access_token");
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      ...fetchOptions
    });

    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const fieldErrors = payload?.errors || {};
      const firstFieldError = Object.values(fieldErrors).flat?.()[0] || fieldErrors.file || fieldErrors.non_field_errors;
      const detail = Array.isArray(firstFieldError) ? firstFieldError[0] : firstFieldError;
      const requestError = new Error(detail || payload?.detail || payload?.message || `Request failed with ${response.status}`);
      requestError.payload = payload;
      requestError.status = response.status;
      throw requestError;
    }

    return await response.json();
  } catch (error) {
    if (fallback !== undefined) {
      return typeof fallback === "function" ? fallback(error) : fallback;
    }
    throw error;
  }
}
