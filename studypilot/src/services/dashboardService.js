import { apiRequest } from "./api";

export function fetchDashboardSummary() {
  return apiRequest("/dashboard/summary/");
}

export function sendActivityHeartbeat() {
  return apiRequest("/activity/heartbeat/", { method: "POST", body: JSON.stringify({}) });
}
