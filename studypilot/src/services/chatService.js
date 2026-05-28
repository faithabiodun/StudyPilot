import { API_BASE_URL } from "./api";

export function sendChatMessage(message, options = {}) {
  const token = localStorage.getItem("studypilot_access_token");
  const payload = {
    message,
    ...(options.documentId ? { document_id: options.documentId } : {})
  };
  const url = `${API_BASE_URL}/advisor/chat/`;

  if (import.meta.env.DEV) {
    console.debug("[StudyPilot Advisor] endpoint", url);
    console.debug("[StudyPilot Advisor] access token exists", Boolean(token));
    console.debug("[StudyPilot Advisor] message length", message?.length || 0);
  }

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  }).then(async (response) => {
    const body = await response.json().catch(() => null);
    if (import.meta.env.DEV) {
      console.debug("[StudyPilot Advisor] response status", response.status);
    }
    if (!response.ok) {
      const errors = body?.errors || {};
      const firstError = Object.values(errors).flat?.()[0] || errors.non_field_errors;
      throw new Error(firstError || body?.message || body?.detail || "Advisor service failed to generate a response.");
    }
    return body;
  });
}
