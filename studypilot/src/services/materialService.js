import { apiRequest } from "./api";

export function uploadMaterial({ file, title }) {
  if (import.meta.env.DEV) {
    console.log("Upload endpoint being called", "/api/documents/upload/");
    console.log("Selected file exists", Boolean(file));
    console.log("File name", file?.name || "");
    console.log("File size", file?.size || 0);
    console.log("Access token exists", Boolean(localStorage.getItem("studypilot_access_token")));
  }
  const formData = new FormData();
  formData.append("file", file);
  if (title) formData.append("title", title);
  return apiRequest("/documents/upload/", { method: "POST", body: formData });
}

export function fetchDocuments() {
  return apiRequest("/documents/");
}

export function cleanupTempDocuments() {
  return apiRequest("/documents/cleanup-temp/", { method: "POST" });
}
