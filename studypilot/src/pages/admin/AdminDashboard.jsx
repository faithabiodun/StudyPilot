import { FilePlus2, LibraryBig, Plus, UploadCloud, Users } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Button from "../../components/common/Button";
import StatCard from "../../components/dashboard/StatCard";
import { adminStats } from "../../data/mockData";

const recent = ["Uploaded student handbook", "Added CSC 310 course", "Added database systems resource", "Updated academic policy document"];

export default function AdminDashboard() {
  return (
    <div>
      <PageHeader title="Admin Overview" subtitle="A structured command center for content that supports AI advising and study tools." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {adminStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <section className="rounded-2xl border border-flight-line bg-flight-card p-6 shadow-panel">
          <h3 className="text-xl font-black text-flight-ink">Admin Actions</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Button icon={Plus}>Add Course</Button>
            <Button icon={UploadCloud} variant="secondary">Upload Academic Document</Button>
            <Button icon={LibraryBig} variant="secondary">Add Resource</Button>
            <Button icon={Users} variant="secondary">View Users</Button>
          </div>
        </section>
        <section className="rounded-2xl bg-flight-midnight p-6 text-white shadow-flight">
          <div className="flex items-center gap-3">
            <FilePlus2 className="text-flight-green" />
            <h3 className="text-xl font-black">Recent Admin Activity</h3>
          </div>
          <div className="mt-5 space-y-3">
            {recent.map((item) => <div key={item} className="rounded-lg bg-white/[0.08] p-4 text-sm font-semibold text-white/70">{item}</div>)}
          </div>
        </section>
      </div>
    </div>
  );
}
