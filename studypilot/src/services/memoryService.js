import { apiRequest } from "./api";

export function fetchBriefing(course) {
  return apiRequest(`/memory/briefing/?course=${encodeURIComponent(course || "")}`, {}, { data: {} });
}

export function fetchStudyHistory() {
  return apiRequest("/memory/history/", {}, { data: { days: [], total_minutes: 0 } });
}

/** Work left unfinished, so a closed tab or a logout is not lost progress. */
export function fetchResumePoints() {
  return apiRequest("/memory/resume/", {}, { data: { items: [] } });
}

/**
 * Checkpoint an in-flight activity. Fire and forget: this runs as the student
 * answers, and a failed checkpoint must never interrupt them.
 */
export function saveProgress({ key, label, payload, done = false }) {
  return apiRequest(
    "/memory/progress/",
    { method: "POST", body: JSON.stringify({ key, label, payload, done }) },
    { data: { written: 0 } }
  );
}
