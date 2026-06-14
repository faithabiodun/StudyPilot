import { API_BASE_URL, apiRequest } from "./api";

const GENERATION_TIMEOUT_MS = 180000;

function friendlyError(error) {
  if (error?.name === "AbortError") {
    return "This video took too long to process. Try a shorter lecture video.";
  }
  if (error?.status === 401) {
    return "Your session expired. Please login again.";
  }
  if (error?.status === 400) {
    return error?.message || "StudyPilot could not read this video. Try a lecture video with captions.";
  }
  if (error?.status >= 500) {
    return "StudyPilot could not process this video right now. Please try again.";
  }
  if (error?.message === "Failed to fetch" || error instanceof TypeError) {
    return "Could not reach StudyPilot backend. Please check your connection.";
  }
  return error?.message || "Something went wrong. Please try again.";
}

function withTimeout(run) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  return run(controller.signal).finally(() => window.clearTimeout(timeout));
}

export function generateYoutubeFlashcards(payload) {
  return withTimeout((signal) =>
    apiRequest("/youtube/flashcards/", { method: "POST", body: JSON.stringify(payload), signal }).catch((error) => {
      throw new Error(friendlyError(error));
    })
  );
}

export function generateYoutubeMCQs(payload) {
  return withTimeout((signal) =>
    apiRequest("/youtube/mcq/", { method: "POST", body: JSON.stringify(payload), signal }).catch((error) => {
      throw new Error(friendlyError(error));
    })
  );
}

export function generateYoutubeQuiz(payload) {
  return withTimeout((signal) =>
    apiRequest("/youtube/quiz/", { method: "POST", body: JSON.stringify(payload), signal }).catch((error) => {
      throw new Error(friendlyError(error));
    })
  );
}

/**
 * The DOCX endpoint streams a real Word file, so we handle the binary response
 * directly instead of going through apiRequest (which parses JSON).
 */
export async function downloadYoutubeDocx(payload) {
  if (!API_BASE_URL) {
    throw new Error("StudyPilot API URL is not configured.");
  }
  const token = localStorage.getItem("studypilot_access_token");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/youtube/docx/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      let message = `Request failed with ${response.status}`;
      try {
        const data = await response.json();
        message = data?.message || message;
      } catch {
        message = friendlyError({ status: response.status });
      }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match ? match[1] : "studypilot-notes.docx";

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return { filename };
  } catch (error) {
    throw new Error(friendlyError(error));
  } finally {
    window.clearTimeout(timeout);
  }
}
