import { Link, Outlet } from "react-router-dom";
import { BookOpen, FileText, Lock, Sparkles } from "lucide-react";
import LogoMark from "../components/common/LogoMark";

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-pilot-sky">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-5 py-10 lg:grid-cols-[0.9fr_1fr]">
        <section className="relative hidden min-h-[620px] overflow-hidden rounded-[2rem] bg-gradient-to-br from-pilot-blue to-blue-700 p-8 text-white shadow-glow lg:block">
          <div className="absolute inset-0 z-0 pilot-grid opacity-50" />
          <Link to="/" aria-label="Go to StudyPilot homepage" className="relative z-20 inline-flex cursor-pointer items-center gap-3 transition hover:opacity-85">
            <LogoMark />
            <span className="text-xl font-black">StudyPilot</span>
          </Link>
          <div data-safe-content className="relative z-20 mx-auto mt-24 max-w-md rounded-[2rem] bg-white/10 p-8 backdrop-blur">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-100">Academic AI workspace</p>
            <h1 className="mt-4 text-5xl font-black leading-tight">Guidance, revision, and resources in one clean place.</h1>
            <p className="mt-5 text-base leading-8 text-blue-50">Built for students who want faster academic support without jumping across scattered notes, links, and PDFs.</p>
          </div>
          {[
            { label: "PDF", icon: FileText, className: "left-8 top-28 -rotate-6" },
            { label: "QUIZ", icon: Sparkles, className: "right-8 top-28 rotate-6" },
            { label: "POLICY", icon: Lock, className: "left-8 bottom-10 rotate-3" },
            { label: "NOTES", icon: BookOpen, className: "right-8 bottom-10 -rotate-3" }
          ].map((item) => (
            <div key={item.label} data-float-card className={`pointer-events-none absolute z-10 flex animate-[heroFloat_5s_ease-in-out_infinite] items-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-black text-pilot-blue shadow-pilot ${item.className}`}>
              <item.icon size={16} />
              {item.label}
            </div>
          ))}
        </section>
        <section className="relative z-20">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
