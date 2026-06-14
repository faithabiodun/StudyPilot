export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const ACCESS_TOKEN_KEY = "studypilot_access_token";
const REFRESH_TOKEN_KEY = "studypilot_refresh_token";

// Shared in-flight refresh so multiple concurrent 401s trigger only one
// refresh request instead of a stampede.
let refreshPromise = null;

function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refresh) return null;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh })
      });
      if (!response.ok) {
        // Refresh token expired or blacklisted: force re-login.
        clearTokens();
        return null;
      }
      const data = await response.json();
      const access = data?.access || data?.data?.access;
      if (!access) {
        clearTokens();
        return null;
      }
      localStorage.setItem(ACCESS_TOKEN_KEY, access);
      // ROTATE_REFRESH_TOKENS is off, but support it if it ever turns on.
      const rotated = data?.refresh || data?.data?.refresh;
      if (rotated) localStorage.setItem(REFRESH_TOKEN_KEY, rotated);
      return access;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function sendRequest(path, fetchOptions, token, isFormData) {
  return fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOptions.headers || {})
    },
    ...fetchOptions
  });
}

async function toRequestError(response) {
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
  return requestError;
}

export async function apiRequest(path, options = {}, fallback) {
  try {
    if (!API_BASE_URL) {
      throw new Error("StudyPilot API URL is not configured. Set VITE_API_BASE_URL.");
    }
    const { skipAuth = false, ...fetchOptions } = options;
    const isFormData = options.body instanceof FormData;
    let token = skipAuth ? "" : localStorage.getItem(ACCESS_TOKEN_KEY);

    let response = await sendRequest(path, fetchOptions, token, isFormData);

    // Access token expired: transparently refresh once and retry.
    // FormData bodies are streams that cannot be re-read after the first send,
    // so we only retry requests with a re-usable (string) body.
    const canRetry = !skipAuth && !isFormData && localStorage.getItem(REFRESH_TOKEN_KEY);
    if (response.status === 401 && canRetry) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await sendRequest(path, fetchOptions, newToken, isFormData);
      }
    }

    if (!response.ok) {
      throw await toRequestError(response);
    }

    return await response.json();
  } catch (error) {
    if (fallback !== undefined) {
      return typeof fallback === "function" ? fallback(error) : fallback;
    }
    throw error;
  }
}
