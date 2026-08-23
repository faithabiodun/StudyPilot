export function getFirstName(user) {
  // The chosen username wins. Wallet sign-ups carry a placeholder full_name
  // like "Sui Wallet 0x760f..." which would otherwise greet them as "Sui".
  const username = (user?.username || "").trim();
  if (username) {
    return username;
  }
  const fullName = user?.full_name || user?.fullName || user?.name || "";
  if (fullName.trim()) {
    return fullName.trim().split(/\s+/)[0];
  }
  if (user?.email && !user.email.endsWith("@sui.studypilot.local")) {
    return user.email.split("@")[0];
  }
  return "Student";
}

export function getFullName(user) {
  return user?.full_name || user?.fullName || user?.name || getFirstName(user);
}

export function getCourses(user) {
  return Array.isArray(user?.current_courses) ? user.current_courses : [];
}

export function getCourseLabel(course) {
  if (typeof course === "string") return course;
  return [course?.code, course?.title].filter(Boolean).join(" - ") || "Current Course";
}

export function getCourseCode(course) {
  if (typeof course === "string") return course.split(" ")[0];
  return course?.code || course?.title || "Course";
}
