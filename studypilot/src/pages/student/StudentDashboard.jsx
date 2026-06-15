import { BookOpen, ClipboardList, ExternalLink, FileText, FolderOpen, GraduationCap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DashboardCard from "../../components/common/DashboardCard";
import CommandCard from "../../components/dashboard/CommandCard";
import StatCard from "../../components/dashboard/StatCard";
import PageHeader from "../../components/layout/PageHeader";
import { actionCards } from "../../data/mockData";
import { useAuth } from "../../context/AuthContext";
import { fetchDashboardSummary } from "../../services/dashboardService";
import { getCourseLabel, getCourses, getFirstName } from "../../utils/user";

const statIcons = {
  active_courses: GraduationCap,
  resource_results: FolderOpen,
  pdf_documents: FileText,
  generated_outputs: ClipboardList
};

function resourceTypeLabel(type) {
  if (type === "youtube") return "YouTube";
  if (type === "textbook") return "Textbook";
  if (type === "article") return "Article";
  if (type === "pdf") return "PDF";
  return "Resource";
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const firstName = getFirstName(user);
  const courses = getCourses(user);
  const focusCourse = courses[0];
  const focusLabel = focusCourse ? getCourseLabel(focusCourse) : "your current courses";
  const goal = Array.isArray(user?.academic_goal) && user.academic_goal.length ? user.academic_goal[0] : "your academic goal";
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchDashboardSummary()
      .then((response) => {
        if (active) setSummary(response.data || {});
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Could not load dashboard summary.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const statCards = useMemo(() => [
    { label: "Active Courses", value: summary?.active_courses ?? courses.length, icon: statIcons.active_courses },
    { label: "Resource Results", value: summary?.resource_results ?? 0, icon: statIcons.resource_results },
    { label: "PDF Documents", value: summary?.pdf_documents ?? 0, icon: statIcons.pdf_documents },
    { label: "Generated Outputs", value: summary?.generated_outputs ?? 0, icon: statIcons.generated_outputs }
  ], [summary, courses.length]);

  // Last 7 days in chronological order (oldest -> today) so the empty-state
  // chart matches the real data shape the backend returns.
  const fallbackProgress = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return { day: date.toLocaleDateString("en-US", { weekday: "short" }), hours: 0 };
  });
  const studyProgress = (summary?.study_progress?.length ? summary.study_progress : fallbackProgress).map((item) => ({
    ...item,
    hours: Number(item.hours || 0)
  }));
  // Round the axis up to a clean whole number so the bars never touch the top
  // and an all-zero week still shows a tidy 0-2h scale instead of a flat line.
  const peakHours = studyProgress.reduce((max, item) => Math.max(max, item.hours), 0);
  const chartMax = Math.max(2, Math.ceil(peakHours + 0.5));
  const totalHours = studyProgress.reduce((sum, item) => sum + item.hours, 0);
  const recentActivity = (summary?.recent_activity || []).slice(0, 5);
  const recommendedResources = summary?.recommended_resources || [];

  return (
    <div>
      <PageHeader title={`Welcome back, ${firstName}`} subtitle={`Ready to continue with ${focusLabel} and ${String(goal).toLowerCase()}?`} />
      {error && <p className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => <StatCard key={card.label} {...card} value={loading ? "..." : card.value} />)}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {actionCards.map((card) => <CommandCard key={card.title} {...card} />)}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.7fr]">
        <DashboardCard title="Study Progress">
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <p className="text-sm text-pilot-muted">Hours spent on StudyPilot in the last 7 days</p>
            <p className="shrink-0 text-sm font-black text-pilot-blue">{totalHours.toFixed(1)}h total</p>
          </div>
          <div className="mt-6 h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={studyProgress} margin={{ top: 12, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dbeafe" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: "#64748b", fontSize: 12, fontWeight: 700 }} />
                <YAxis
                  domain={[0, chartMax]}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#64748b", fontSize: 12, fontWeight: 700 }}
                  width={44}
                  label={{ value: "Hours", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12, fontWeight: 700 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(37, 99, 235, 0.08)" }}
                  formatter={(value) => [`${Number(value).toFixed(2)}h`, "Studied"]}
                  labelFormatter={(label, payload) => {
                    const date = payload?.[0]?.payload?.date;
                    if (!date) return label;
                    return new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
                  }}
                  labelStyle={{ color: "#0f172a", fontWeight: 800 }}
                  contentStyle={{ borderRadius: 14, borderColor: "#dbeafe", boxShadow: "0 14px 40px rgba(15, 23, 42, 0.12)" }}
                />
                <Bar dataKey="hours" fill="#2563eb" radius={[10, 10, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>
        <DashboardCard title="Recent Activity">
          <div className="mt-5 space-y-3">
            {recentActivity.length ? recentActivity.map((item) => (
              <div key={`${item.type}-${item.created_at}-${item.title}`} className="rounded-2xl bg-pilot-sky px-4 py-3">
                <p className="text-sm font-black text-pilot-ink">{item.title}</p>
                <p className="mt-1 text-xs font-semibold text-pilot-muted">{item.description}</p>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-pilot-line bg-pilot-ice px-4 py-6 text-sm font-bold text-pilot-muted">
                Your recent activity will appear here once you start using StudyPilot.
              </div>
            )}
          </div>
        </DashboardCard>
      </div>
      <DashboardCard title="Academic Passport Focus" className="mt-6">
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-pilot-soft p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-pilot-blue">Current Focus</p>
            <p className="mt-2 font-black text-pilot-ink">{focusLabel}</p>
          </div>
          <div className="rounded-2xl bg-pilot-soft p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-pilot-blue">Next Action</p>
            <p className="mt-2 font-black text-pilot-ink">Generate practice questions from your course notes.</p>
          </div>
          <div className="rounded-2xl bg-pilot-soft p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-pilot-blue">Suggested Tool</p>
            <p className="mt-2 font-black text-pilot-ink">PDF Study Converter</p>
          </div>
        </div>
      </DashboardCard>
      <DashboardCard title="Recommended Resources" className="mt-6">
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {recommendedResources.length ? recommendedResources.map((resource) => (
            <button
              key={`${resource.resource_type}-${resource.url}-${resource.title}`}
              onClick={() => window.open(resource.url, "_blank", "noopener,noreferrer")}
              className="rounded-2xl border border-pilot-line bg-pilot-ice p-4 text-left transition hover:-translate-y-0.5 hover:border-pilot-blue hover:bg-white hover:shadow-soft"
            >
              {resource.thumbnail ? <img src={resource.thumbnail} alt="" className="mb-3 aspect-video w-full rounded-xl object-cover" /> : <BookOpen className="text-pilot-blue" size={22} />}
              <h4 className="line-clamp-2 font-black text-pilot-ink">{resource.title}</h4>
              <p className="mt-1 text-xs font-semibold text-pilot-muted">{resourceTypeLabel(resource.resource_type)} | {resource.source_name}</p>
              <p className="mt-3 inline-flex items-center gap-1 text-xs font-black text-pilot-blue">Open <ExternalLink size={13} /></p>
            </button>
          )) : (
            <div className="rounded-2xl border border-dashed border-pilot-line bg-pilot-ice p-6 text-sm font-bold text-pilot-muted md:col-span-2 xl:col-span-5">
              Search Resource Hub to discover personalized recommendations.
            </div>
          )}
        </div>
      </DashboardCard>
    </div>
  );
}
