import { ArrowRight, FileText } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import { systemFlow } from "../../data/mockData";

const pdfFlow = ["Student uploads PDF", "Django receives file", "PyMuPDF or pdfplumber extracts text", "Text is cleaned", "LangChain generates flashcards and quizzes", "Output is saved in PostgreSQL", "Student reviews output"];

export default function SystemMapPage() {
  return (
    <div>
      <PageHeader title="System Map" subtitle="A visual explanation of the StudyPilot frontend, API, retrieval, and PDF generation flows." />
      <section className="rounded-2xl bg-flight-midnight p-6 text-white shadow-flight">
        <h3 className="text-xl font-black">Full Stack Flow</h3>
        <div className="mt-6 grid gap-4 xl:grid-cols-7">
          {systemFlow.map((item, index) => (
            <div key={item.label} className="relative rounded-xl border border-white/10 bg-white/[0.06] p-4">
              <item.icon className="mb-4 text-flight-blue" size={24} />
              <p className="text-sm font-bold leading-6 text-white/78">{item.label}</p>
              {index < systemFlow.length - 1 && <ArrowRight className="absolute -right-5 top-1/2 hidden -translate-y-1/2 text-flight-green xl:block" size={20} />}
            </div>
          ))}
        </div>
      </section>
      <section className="mt-6 rounded-2xl border border-flight-line bg-flight-card p-6 shadow-panel">
        <div className="flex items-center gap-3">
          <FileText className="text-flight-green" />
          <h3 className="text-xl font-black text-flight-ink">PDF Flow</h3>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          {pdfFlow.map((item, index) => (
            <div key={item} className="rounded-xl border border-flight-line bg-white p-4">
              <div className="mb-4 grid h-8 w-8 place-items-center rounded-full bg-flight-green text-xs font-black text-white">{index + 1}</div>
              <p className="text-sm font-bold leading-6 text-flight-muted">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
