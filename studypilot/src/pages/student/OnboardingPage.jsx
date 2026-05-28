import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle, GraduationCap, Layers, Sparkles, Target } from "lucide-react";
import Button from "../../components/common/Button";
import LogoMark from "../../components/common/LogoMark";
import Input from "../../components/common/Input";
import Select from "../../components/common/Select";
import { useAuth } from "../../context/AuthContext";
import { completeOnboarding } from "../../services/authService";
import { getFirstName } from "../../utils/user";

const goals = [
  "Improve my grades",
  "Prepare for exams",
  "Understand difficult topics",
  "Organize my study materials",
  "Generate quizzes and flashcards",
  "Find better learning resources"
];

const learningOptions = [
  "YouTube videos",
  "Textbooks",
  "PDF notes",
  "Short summaries",
  "Flashcards",
  "Practice quizzes",
  "Step by step explanations"
];

function toggle(list, item) {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, completeAuth, logout } = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [courseDraft, setCourseDraft] = useState({ code: "", title: "" });
  const [weakDraft, setWeakDraft] = useState("");
  const [form, setForm] = useState({
    institution: user?.institution || "",
    department: user?.department || "",
    faculty: user?.faculty || "",
    level: user?.level || "",
    semester: user?.semester || "",
    matric_number: user?.matric_number || "",
    current_courses: user?.current_courses?.length ? user.current_courses : [],
    academic_goal: Array.isArray(user?.academic_goal) ? user.academic_goal : [],
    preferred_learning_style: user?.preferred_learning_style || "",
    preferred_resource_types: Array.isArray(user?.preferred_resource_types) ? user.preferred_resource_types : [],
    weak_courses: Array.isArray(user?.weak_courses) ? user.weak_courses : [],
    study_hours_per_week: user?.study_hours_per_week || "",
    exam_preparation_focus: user?.exam_preparation_focus || "",
    career_interest: user?.career_interest || ""
  });

  const steps = useMemo(() => [
    { title: "Academic Identity", icon: GraduationCap },
    { title: "Current Courses", icon: BookOpen },
    { title: "Study Goals", icon: Target },
    { title: "Learning Preferences", icon: Sparkles },
    { title: "Weak Areas", icon: Layers },
    { title: "Review and Finish", icon: CheckCircle }
  ], []);

  if (!user) return <Navigate to="/login" replace />;
  if (user.profile_completed) return <Navigate to="/dashboard" replace />;

  const addCourse = () => {
    if (!courseDraft.code.trim() && !courseDraft.title.trim()) return;
    setForm((current) => ({ ...current, current_courses: [...current.current_courses, { code: courseDraft.code.trim(), title: courseDraft.title.trim() }] }));
    setCourseDraft({ code: "", title: "" });
  };

  const addWeakCourse = () => {
    if (!weakDraft.trim()) return;
    setForm((current) => ({ ...current, weak_courses: [...current.weak_courses, weakDraft.trim()] }));
    setWeakDraft("");
  };

  const validateStep = () => {
    const messages = [
      !form.institution || !form.department || !form.level || !form.semester ? "Add your institution, department, level, and semester." : "",
      !form.current_courses.length ? "Add at least one current course." : "",
      !form.academic_goal.length ? "Choose at least one academic goal." : "",
      !form.preferred_learning_style || !form.preferred_resource_types.length ? "Choose your learning style and resource preferences." : "",
      "",
      ""
    ];
    const message = messages[step];
    setError(message);
    return !message;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const finish = async () => {
    setError("");
    setLoading(true);
    try {
      const updatedUser = await completeOnboarding({
        ...form,
        study_hours_per_week: form.study_hours_per_week ? Number(form.study_hours_per_week) : null
      });
      completeAuth(updatedUser);
      navigate("/dashboard", { replace: true });
    } catch (finishError) {
      setError(finishError.message || "Could not complete your Academic Passport.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-pilot-sky px-5 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Go to StudyPilot homepage" className="inline-flex cursor-pointer items-center gap-3 font-black text-pilot-ink transition hover:opacity-80">
            <LogoMark />
            StudyPilot
          </Link>
          <button onClick={logout} className="rounded-full border border-pilot-line bg-white px-4 py-2 text-sm font-black text-pilot-muted transition hover:border-pilot-blue hover:text-pilot-blue">Sign Out</button>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-[2rem] border border-pilot-line bg-white p-6 shadow-soft">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-pilot-blue">Student Academic Passport</p>
            <h1 className="mt-3 text-3xl font-black text-pilot-ink">Welcome, {getFirstName(user)}</h1>
            <p className="mt-3 text-sm leading-6 text-pilot-muted">Set up your academic profile so StudyPilot can personalize your AI guidance, quizzes, flashcards, and resources.</p>
            <div className="mt-7 space-y-3">
              {steps.map((item, index) => (
                <button key={item.title} onClick={() => setStep(index)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${step === index ? "bg-pilot-blue text-white shadow-glow" : "bg-pilot-sky text-pilot-muted hover:text-pilot-blue"}`}>
                  <item.icon size={18} />
                  {index + 1}. {item.title}
                </button>
              ))}
            </div>
          </aside>

          <section className="rounded-[2rem] border border-pilot-line bg-white p-6 shadow-pilot md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-pilot-blue">Step {step + 1} of {steps.length}</p>
                <h2 className="mt-2 text-3xl font-black text-pilot-ink">{steps[step].title}</h2>
              </div>
              <div className="hidden h-2 w-40 overflow-hidden rounded-full bg-pilot-soft md:block">
                <div className="h-full bg-pilot-blue transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
              </div>
            </div>

            {error && <p className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

            {step === 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                <Input label="Institution" value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} />
                <Input label="Department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
                <Input label="Faculty" value={form.faculty} onChange={(event) => setForm({ ...form, faculty: event.target.value })} />
                <Select label="Level" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>
                  <option value="">Select level</option>
                  {["100 Level", "200 Level", "300 Level", "400 Level", "500 Level"].map((item) => <option key={item}>{item}</option>)}
                </Select>
                <Select label="Semester" value={form.semester} onChange={(event) => setForm({ ...form, semester: event.target.value })}>
                  <option value="">Select semester</option>
                  {["First Semester", "Second Semester", "Summer Semester"].map((item) => <option key={item}>{item}</option>)}
                </Select>
                <Input label="Matric number (optional)" value={form.matric_number} onChange={(event) => setForm({ ...form, matric_number: event.target.value })} />
              </div>
            )}

            {step === 1 && (
              <div>
                <div className="grid gap-4 md:grid-cols-[0.45fr_1fr_auto]">
                  <Input label="Course code" placeholder="CSC 310" value={courseDraft.code} onChange={(event) => setCourseDraft({ ...courseDraft, code: event.target.value })} />
                  <Input label="Course title" placeholder="Compiler Construction" value={courseDraft.title} onChange={(event) => setCourseDraft({ ...courseDraft, title: event.target.value })} />
                  <Button type="button" className="self-end" onClick={addCourse}>Add Course</Button>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {form.current_courses.map((course, index) => (
                    <button key={`${course.code}-${index}`} onClick={() => setForm((current) => ({ ...current, current_courses: current.current_courses.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-2xl border border-pilot-line bg-pilot-ice p-4 text-left transition hover:border-red-200 hover:bg-red-50">
                      <p className="font-black text-pilot-ink">{course.code || "Course"}</p>
                      <p className="text-sm text-pilot-muted">{course.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-3 md:grid-cols-2">
                {goals.map((goal) => (
                  <button key={goal} onClick={() => setForm({ ...form, academic_goal: toggle(form.academic_goal, goal) })} className={`rounded-2xl border p-4 text-left text-sm font-black transition ${form.academic_goal.includes(goal) ? "border-pilot-blue bg-pilot-blue text-white shadow-glow" : "border-pilot-line bg-pilot-ice text-pilot-muted hover:border-pilot-blue hover:text-pilot-blue"}`}>{goal}</button>
                ))}
              </div>
            )}

            {step === 3 && (
              <div>
                <Select label="How do you prefer to learn?" value={form.preferred_learning_style} onChange={(event) => setForm({ ...form, preferred_learning_style: event.target.value })}>
                  <option value="">Choose one primary style</option>
                  {learningOptions.map((item) => <option key={item}>{item}</option>)}
                </Select>
                <p className="mt-6 text-sm font-black text-pilot-ink">Preferred resource types</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {learningOptions.map((item) => (
                    <button key={item} onClick={() => setForm({ ...form, preferred_resource_types: toggle(form.preferred_resource_types, item) })} className={`rounded-2xl border p-4 text-left text-sm font-black transition ${form.preferred_resource_types.includes(item) ? "border-pilot-blue bg-pilot-blue text-white shadow-glow" : "border-pilot-line bg-pilot-ice text-pilot-muted hover:border-pilot-blue hover:text-pilot-blue"}`}>{item}</button>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                  <Input label="Weak course or topic" placeholder="Lexical analysis" value={weakDraft} onChange={(event) => setWeakDraft(event.target.value)} />
                  <Button type="button" className="self-end" onClick={addWeakCourse}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.weak_courses.map((item, index) => (
                    <button key={item} onClick={() => setForm((current) => ({ ...current, weak_courses: current.weak_courses.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-full bg-pilot-soft px-4 py-2 text-sm font-black text-pilot-blue">{item}</button>
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input label="Study hours per week" type="number" value={form.study_hours_per_week} onChange={(event) => setForm({ ...form, study_hours_per_week: event.target.value })} />
                  <Input label="Exam/test/assignment focus" value={form.exam_preparation_focus} onChange={(event) => setForm({ ...form, exam_preparation_focus: event.target.value })} />
                </div>
                <Input label="Career interest" value={form.career_interest} onChange={(event) => setForm({ ...form, career_interest: event.target.value })} />
              </div>
            )}

            {step === 5 && (
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ["Institution", form.institution],
                  ["Department", form.department],
                  ["Level", form.level],
                  ["Semester", form.semester],
                  ["Courses", form.current_courses.map((course) => `${course.code} ${course.title}`).join(", ")],
                  ["Goals", form.academic_goal.join(", ")],
                  ["Learning Style", form.preferred_learning_style],
                  ["Resources", form.preferred_resource_types.join(", ")],
                  ["Weak Areas", form.weak_courses.join(", ") || "Not added"],
                  ["Weekly Study Hours", form.study_hours_per_week || "Not added"]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-pilot-line bg-pilot-ice p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-pilot-blue">{label}</p>
                    <p className="mt-2 text-sm font-bold text-pilot-ink">{value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-wrap justify-between gap-3">
              <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(current - 1, 0))}>Back</Button>
              {step < steps.length - 1 ? (
                <Button type="button" icon={ArrowRight} onClick={next}>Continue</Button>
              ) : (
                <Button type="button" disabled={loading} icon={CheckCircle} onClick={finish}>{loading ? "Saving..." : "Complete My Academic Passport"}</Button>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
