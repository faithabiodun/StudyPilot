import { apiRequest } from "./api";

/**
 * Ask the advisor. Routed through apiRequest so an expired access token is
 * refreshed and the call retried; this used a raw fetch and so silently 401ed
 * once the hour was up.
 *
 * Passing sessionId continues an existing conversation instead of starting a
 * new one, which is what the recent chats list relies on.
 */
export function sendChatMessage(message, options = {}) {
  return apiRequest("/advisor/chat/", {
    method: "POST",
    body: JSON.stringify({
      message,
      ...(options.sessionId ? { session_id: options.sessionId } : {}),
      ...(options.documentId ? { document_id: options.documentId } : {})
    })
  });
}

export function fetchChatSessions() {
  // An empty list is a fine outcome for a new student, so never surface a
  // failure here as an error in the chat panel.
  return apiRequest("/advisor/sessions/", {}, { data: [] });
}

export function fetchChatSession(sessionId) {
  return apiRequest(`/advisor/sessions/${sessionId}/`);
}
