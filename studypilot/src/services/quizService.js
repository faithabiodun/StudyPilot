import { apiRequest } from "./api";

export function generateQuiz(payload) {
  return apiRequest("/quizzes/generate/", { method: "POST", body: JSON.stringify(payload) });
}

export function generateMCQs(payload) {
  return apiRequest("/quizzes/generate-mcq/", { method: "POST", body: JSON.stringify(payload) });
}

export function fetchQuizzes() {
  return apiRequest("/quizzes/");
}
