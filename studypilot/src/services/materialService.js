import { apiRequest, refreshAccessToken } from "./api";

export const MAX_PDF_UPLOAD_MB = Number(import.meta.env.VITE_MAX_PDF_UPLOAD_MB || 50);
const UPLOAD_TIMEOUT_MS = 180000;

function uploadErrorMessage(error, maxPdfUploadMb) {
  if (import.meta.env.DEV) {
    console.log("PDF upload failed status", error?.status || "");
    console.log("PDF upload failed endpoint", "/api/documents/upload/");
    console.log("PDF upload failed message", error?.message || "");
  }
  if (error?.name === "AbortError") {
    return "The PDF took too long to process. Try a smaller file or compressed PDF.";
  }
  if (error?.status === 413) {
    return "This PDF is too large. Please upload a smaller PDF.";
  }
  if (error?.status === 401) {
    return "Your session expired. Please login again.";
  }
  if (error?.status >= 500) {
    return "StudyPilot could not process this PDF. Please try another file.";
  }
  if (error?.message === "Failed to fetch" || error instanceof TypeError) {
    return "Could not reach StudyPilot backend. Please check your connection or try again.";
  }
  return error?.message || `StudyPilot can process PDFs up to ${maxPdfUploadMb}MB. Please upload a readable PDF.`;
}

function normalizeUploadError(error, maxPdfUploadMb) {
  const normalized = new Error(uploadErrorMessage(error, maxPdfUploadMb));
  normalized.status = error?.status;
  normalized.payload = error?.payload;
  normalized.name = error?.name || "Error";
  return normalized;
}

export async function fetchDeploymentHealth() {
  return apiRequest("/health/deployment/", { method: "GET", skipAuth: true });
}

export async function uploadMaterial({ file, title, maxPdfUploadMb = MAX_PDF_UPLOAD_MB }) {
  const uploadLimitMb = Number(maxPdfUploadMb || MAX_PDF_UPLOAD_MB);
  const uploadLimitBytes = uploadLimitMb * 1024 * 1024;
  if (import.meta.env.DEV) {
    console.log("Upload endpoint being called", "/api/documents/upload/");
    console.log("Selected file exists", Boolean(file));
    console.log("File name", file?.name || "");
    console.log("File size", file?.size || 0);
    console.log("Access token exists", Boolean(localStorage.getItem("studypilot_access_token")));
  }
  if (file?.size > uploadLimitBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`This PDF is ${sizeMb}MB. StudyPilot can process PDFs up to ${uploadLimitMb}MB. Please upload a smaller or compressed PDF.`);
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  // FormData is a one-shot stream, so apiRequest cannot auto-retry it. We build
  // a fresh FormData per attempt and refresh the token ourselves on a 401.
  const buildForm = () => {
    const formData = new FormData();
    formData.append("file", file);
    if (title) formData.append("title", title);
    return formData;
  };
  try {
    try {
      return await apiRequest("/documents/upload/", { method: "POST", body: buildForm(), signal: controller.signal });
    } catch (error) {
      if (error?.status === 401 && localStorage.getItem("studypilot_refresh_token")) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          return await apiRequest("/documents/upload/", { method: "POST", body: buildForm(), signal: controller.signal });
        }
      }
      throw error;
    }
  } catch (error) {
    throw normalizeUploadError(error, uploadLimitMb);
  } finally {
    window.clearTimeout(timeout);
  }
}

export function fetchDocuments() {
  return apiRequest("/documents/");
}

export function cleanupTempDocuments() {
  return apiRequest("/documents/cleanup-temp/", { method: "POST" });
}
