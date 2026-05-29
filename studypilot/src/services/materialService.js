import { apiRequest } from "./api";

export const MAX_PDF_UPLOAD_MB = Number(import.meta.env.VITE_MAX_PDF_UPLOAD_MB || 12);
export const MAX_PDF_UPLOAD_BYTES = MAX_PDF_UPLOAD_MB * 1024 * 1024;

export function uploadMaterial({ file, title }) {
  if (import.meta.env.DEV) {
    console.log("Upload endpoint being called", "/api/documents/upload/");
    console.log("Selected file exists", Boolean(file));
    console.log("File name", file?.name || "");
    console.log("File size", file?.size || 0);
    console.log("Access token exists", Boolean(localStorage.getItem("studypilot_access_token")));
  }
  if (file?.size > MAX_PDF_UPLOAD_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`This PDF is ${sizeMb}MB. StudyPilot can process PDFs up to ${MAX_PDF_UPLOAD_MB}MB on the deployed app. Please upload a smaller or compressed PDF.`);
  }
  const formData = new FormData();
  formData.append("file", file);
  if (title) formData.append("title", title);
  return apiRequest("/documents/upload/", { method: "POST", body: formData }).catch((error) => {
    if (error?.message === "Failed to fetch") {
      throw new Error(`The PDF upload could not reach StudyPilot. If this PDF is near ${MAX_PDF_UPLOAD_MB}MB, please compress it or choose a smaller file and try again.`);
    }
    throw error;
  });
}

export function fetchDocuments() {
  return apiRequest("/documents/");
}

export function cleanupTempDocuments() {
  return apiRequest("/documents/cleanup-temp/", { method: "POST" });
}
