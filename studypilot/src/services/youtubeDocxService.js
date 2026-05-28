import { API_BASE_URL, apiRequest } from "./api";

export function analyzeYoutubeVideo(youtubeUrl) {
  return apiRequest("/youtube-docx/analyze/", {
    method: "POST",
    body: JSON.stringify({ youtube_url: youtubeUrl })
  });
}

export function generateYoutubeDocx(payload) {
  return apiRequest("/youtube-docx/generate/", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function downloadYoutubeDocx(downloadUrl) {
  const token = localStorage.getItem("studypilot_access_token");
  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
  const response = await fetch(`${apiOrigin}${downloadUrl}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    let message = "Could not download DOCX.";
    try {
      const payload = await response.json();
      message = payload?.message || payload?.detail || message;
    } catch {
      message = response.status === 404 ? "The DOCX file has expired. Generate it again." : message;
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  const filename = filenameMatch?.[1] || "studypilot_youtube_notes.docx";
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
