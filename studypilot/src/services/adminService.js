import { apiRequest } from "./api";
import { courses, documents, resources, users } from "../data/mockData";

export const adminService = {
  getCourses: () => apiRequest("/admin/courses/", {}, courses),
  getDocuments: () => apiRequest("/admin/documents/", {}, documents),
  getResources: () => apiRequest("/admin/resources/", {}, resources),
  getUsers: () => apiRequest("/admin/users/", {}, users)
};
