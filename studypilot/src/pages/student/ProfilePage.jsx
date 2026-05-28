import { useMemo, useState } from "react";
import { BookOpen, Briefcase, CheckCircle, GraduationCap, Layers, Plus, ShieldCheck, Sparkles, Target, Trash2, User } from "lucide-react";
import Button from "../../components/common/Button";
import DashboardCard from "../../components/common/DashboardCard";
import Input from "../../components/common/Input";
import Select from "../../components/common/Select";
import PageHeader from "../../components/layout/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { updateProfile } from "../../services/authService";
import { getCourseLabel, getCourses, getFirstName, getFullName } from "../../utils/user";

function InfoCard({ icon: Icon, title, children }) {
  return (
    <div className="rounded-[1.5rem] border border-pilot-line bg-pilot-ice p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue">
          <Icon size={20} />
        </div>
        <h3 className="font-black text-pilot-ink">{title}</h3>
      </div>
      <div className="mt-4 text-sm leading-6 text-pilot-muted">{children}</div>
    </div>
  );
}

function PillList({ items }) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return <span className="text-pilot-muted">Not added yet</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((item) => (
        <span key={typeof item === "string" ? item : getCourseLabel(item)} className="rounded-full bg-white px-3 py-1 text-xs font-black text-pilot-blue">
          {typeof item === "string" ? item : getCourseLabel(item)}
        </span>
      ))}
    </div>
  );
}

function TextArea({ label, ...props }) {
  return (
    <label className="block md:col-span-2">
      <span className="mb-2 block text-sm font-semibold text-pilot-ink">{label}</span>
      <textarea className="min-h-28 w-full rounded-xl border border-pilot-line bg-white px-4 py-3 text-sm text-pilot-ink outline-none transition placeholder:text-pilot-muted/70 focus:border-pilot-blue focus:ring-4 focus:ring-pilot-blue/10" {...props} />
    </label>
  );
}

function csvToList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export default function ProfilePage() {
  const { user, completeAuth } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    full_name: getFullName(user),
    matric_number: user?.matric_number || "",
    institution: user?.institution || "",
    faculty: user?.faculty || "",
    department: user?.department || "",
    level: user?.level || "",
    semester: user?.semester || "",
    preferred_learning_style: user?.preferred_learning_style || "",
    current_courses: getCourses(user),
    academic_goal_text: Array.isArray(user?.academic_goal) ? user.academic_goal.join(", ") : "",
    weak_courses_text: Array.isArray(user?.weak_courses) ? user.weak_courses.join(", ") : "",
    preferred_resource_types_text: Array.isArray(user?.preferred_resource_types) ? user.preferred_resource_types.join(", ") : "",
    study_hours_per_week: user?.study_hours_per_week || "",
    exam_preparation_focus: user?.exam_preparation_focus || "",
    career_interest: user?.career_interest || ""
  });
  const [courseDraft, setCourseDraft] = useState({ code: "", title: "" });

  const completeness = useMemo(() => {
    const fields = ["institution", "department", "level", "semester", "current_courses", "academic_goal", "preferred_learning_style", "preferred_resource_types", "study_hours_per_week", "career_interest"];
    const complete = fields.filter((field) => {
      const value = user?.[field];
      return Array.isArray(value) ? value.length : Boolean(value);
    }).length;
    return Math.round((complete / fields.length) * 100);
  }, [user]);

  const saveProfile = async () => {
    setSaving(true);
    setMessage("");
    try {
      const updated = await updateProfile({
        full_name: form.full_name,
        matric_number: form.matric_number,
        institution: form.institution,
        faculty: form.faculty,
        department: form.department,
        level: form.level,
        semester: form.semester,
        current_courses: form.current_courses,
        academic_goal: csvToList(form.academic_goal_text),
        weak_courses: csvToList(form.weak_courses_text),
        preferred_learning_style: form.preferred_learning_style,
        preferred_resource_types: csvToList(form.preferred_resource_types_text),
        exam_preparation_focus: form.exam_preparation_focus,
        career_interest: form.career_interest,
        study_hours_per_week: form.study_hours_per_week ? Number(form.study_hours_per_week) : null
      });
      completeAuth(updated);
      setEditing(false);
      setMessage("Profile updated successfully.");
    } catch (error) {
      setMessage(error.message || "Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  const saveCourses = async (courses, successMessage) => {
    setSaving(true);
    setMessage("");
    try {
      const updated = await updateProfile({ current_courses: courses });
      completeAuth(updated);
      setForm((current) => ({ ...current, current_courses: getCourses(updated) }));
      setMessage(successMessage);
    } catch (error) {
      setMessage(error.message || "Could not update courses.");
    } finally {
      setSaving(false);
    }
  };

  const addCourse = async () => {
    const title = courseDraft.title.trim();
    const code = courseDraft.code.trim().toUpperCase();
    if (!title) {
      setMessage("Course title is required.");
      return;
    }
    const exists = form.current_courses.some((course) => {
      const existingCode = (course.code || "").toLowerCase();
      const existingTitle = (course.title || "").toLowerCase();
      return (code && existingCode === code.toLowerCase()) || existingTitle === title.toLowerCase();
    });
    if (exists) {
      setMessage("This course is already in your Academic Passport.");
      return;
    }
    const nextCourses = [...form.current_courses, { code, title }];
    setCourseDraft({ code: "", title: "" });
    await saveCourses(nextCourses, "Course added successfully.");
  };

  const deleteCourse = async (index) => {
    const nextCourses = form.current_courses.filter((_, courseIndex) => courseIndex !== index);
    await saveCourses(nextCourses, "Course deleted successfully.");
  };

  return (
    <div>
      <PageHeader title="My Profile" subtitle={`Academic Passport for ${getFirstName(user)}. Keep this updated so StudyPilot can personalize your workspace.`} />
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <DashboardCard>
          <div className="text-center">
            <div className="mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-pilot-soft text-3xl font-black text-pilot-blue">
              {user?.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : getFirstName(user)[0]?.toUpperCase()}
            </div>
            <h3 className="mt-5 text-xl font-black text-pilot-ink">{getFullName(user)}</h3>
            <p className="mt-1 text-sm text-pilot-muted">{user?.email}</p>
            <div className="mt-5 rounded-2xl bg-pilot-soft p-4 text-left">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-pilot-ink">Academic Passport</p>
                <p className="text-sm font-black text-pilot-blue">{completeness}%</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-pilot-blue" style={{ width: `${completeness}%` }} />
              </div>
            </div>
            <Button className="mt-5 w-full" icon={User} onClick={() => setEditing((current) => !current)}>{editing ? "Close Editor" : "Edit Profile"}</Button>
          </div>
        </DashboardCard>

        <div className="space-y-6">
          <DashboardCard title="How StudyPilot Uses Your Profile">
            <div className="mt-5 rounded-2xl bg-pilot-soft p-5 text-sm font-semibold leading-7 text-pilot-blue">
              <ShieldCheck className="mr-2 inline" size={18} />
              StudyPilot uses your academic profile to recommend better resources, generate course aware quizzes, personalize flashcards, and make AI advisor responses more relevant to your studies.
            </div>
          </DashboardCard>

          {editing && (
            <DashboardCard title="Edit Academic Passport">
              {message && <p className="mt-4 rounded-xl bg-pilot-soft px-4 py-3 text-sm font-bold text-pilot-blue">{message}</p>}
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Input label="Full Name" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
                <Input label="Matric Number" value={form.matric_number} onChange={(event) => setForm({ ...form, matric_number: event.target.value })} />
                <Input label="Institution" value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} />
                <Input label="Faculty" value={form.faculty} onChange={(event) => setForm({ ...form, faculty: event.target.value })} />
                <Input label="Department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
                <Select label="Level" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>
                  {["100 Level", "200 Level", "300 Level", "400 Level", "500 Level"].map((item) => <option key={item}>{item}</option>)}
                </Select>
                <Select label="Semester" value={form.semester} onChange={(event) => setForm({ ...form, semester: event.target.value })}>
                  {["First Semester", "Second Semester", "Summer Semester"].map((item) => <option key={item}>{item}</option>)}
                </Select>
                <div className="md:col-span-2 rounded-2xl border border-pilot-line bg-pilot-ice p-4">
                  <p className="text-sm font-black text-pilot-ink">Current Courses</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[0.35fr_1fr_auto]">
                    <Input label="Course Code" placeholder="CSC 310" value={courseDraft.code} onChange={(event) => setCourseDraft({ ...courseDraft, code: event.target.value })} />
                    <Input label="Course Title" placeholder="Compiler Construction" value={courseDraft.title} onChange={(event) => setCourseDraft({ ...courseDraft, title: event.target.value })} />
                    <div className="flex items-end">
                      <Button type="button" icon={Plus} onClick={addCourse} disabled={saving} className="w-full">Add</Button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {form.current_courses.length ? form.current_courses.map((course, index) => (
                      <div key={`${course.code}-${course.title}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                        <span className="text-sm font-bold text-pilot-ink">{getCourseLabel(course)}</span>
                        <button type="button" onClick={() => deleteCourse(index)} disabled={saving} className="rounded-lg p-2 text-red-600 transition hover:bg-red-50">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )) : <p className="text-sm font-bold text-pilot-muted">No courses added yet.</p>}
                  </div>
                </div>
                <TextArea label="Academic Goals (comma separated)" value={form.academic_goal_text} onChange={(event) => setForm({ ...form, academic_goal_text: event.target.value })} />
                <Input label="Preferred Learning Style" value={form.preferred_learning_style} onChange={(event) => setForm({ ...form, preferred_learning_style: event.target.value })} />
                <TextArea label="Preferred Resource Types (comma separated)" value={form.preferred_resource_types_text} onChange={(event) => setForm({ ...form, preferred_resource_types_text: event.target.value })} />
                <TextArea label="Weak Courses or Topics (comma separated)" value={form.weak_courses_text} onChange={(event) => setForm({ ...form, weak_courses_text: event.target.value })} />
                <Input label="Study Hours Per Week" type="number" value={form.study_hours_per_week} onChange={(event) => setForm({ ...form, study_hours_per_week: event.target.value })} />
                <Input label="Exam Preparation Focus" value={form.exam_preparation_focus} onChange={(event) => setForm({ ...form, exam_preparation_focus: event.target.value })} />
                <Input label="Career Interest" value={form.career_interest} onChange={(event) => setForm({ ...form, career_interest: event.target.value })} />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={saveProfile} disabled={saving}>{saving ? "Saving..." : "Save Profile"}</Button>
                <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </DashboardCard>
          )}

          <div className="flex flex-wrap gap-3">
            {["Edit Academic Identity", "Edit Current Courses", "Edit Learning Preferences"].map((label) => (
              <Button key={label} variant="secondary" onClick={() => setEditing(true)}>{label}</Button>
            ))}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <InfoCard icon={User} title="Personal Information">
              <p>{getFullName(user)}</p>
              <p>{user?.email}</p>
              <p>{user?.matric_number || "Matric number not added"}</p>
            </InfoCard>
            <InfoCard icon={GraduationCap} title="Academic Identity">
              <p>{user?.institution || "Institution not added"}</p>
              <p>{[user?.faculty, user?.department].filter(Boolean).join(" - ") || "Faculty and department not added"}</p>
              <p>{[user?.level, user?.semester].filter(Boolean).join(" - ") || "Level and semester not added"}</p>
            </InfoCard>
            <InfoCard icon={BookOpen} title="Current Courses">
              <PillList items={getCourses(user)} />
            </InfoCard>
            <InfoCard icon={Target} title="Study Goals">
              <PillList items={user?.academic_goal} />
            </InfoCard>
            <InfoCard icon={Sparkles} title="Learning Preferences">
              <p className="font-bold text-pilot-ink">{user?.preferred_learning_style || "Not added yet"}</p>
              <div className="mt-3"><PillList items={user?.preferred_resource_types} /></div>
            </InfoCard>
            <InfoCard icon={Layers} title="Weak Areas">
              <PillList items={user?.weak_courses} />
            </InfoCard>
            <InfoCard icon={CheckCircle} title="Study Availability">
              <p>{user?.study_hours_per_week ? `${user.study_hours_per_week} hours per week` : "Study hours not added"}</p>
              <p>{user?.exam_preparation_focus || "No exam focus added"}</p>
            </InfoCard>
            <InfoCard icon={Briefcase} title="Career Interest">
              <p>{user?.career_interest || "Career interest not added"}</p>
            </InfoCard>
          </div>
        </div>
      </div>
    </div>
  );
}
