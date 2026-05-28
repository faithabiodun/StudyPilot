import { apiRequest } from "./api";

export function getResourceRecommendations({ query = "", type = "all" } = {}) {
  const params = new URLSearchParams({
    q: query,
    type
  });
  return apiRequest(`/resources/recommendations/?${params.toString()}`);
}

export function saveResource(payload) {
  return apiRequest("/resources/save/", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function trackResourceOpen(payload) {
  return apiRequest("/resources/track-open/", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchSavedResources() {
  return apiRequest("/resources/saved/");
}
