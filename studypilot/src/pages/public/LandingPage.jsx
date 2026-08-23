import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap } from "lucide-react";
import Button from "../../components/common/Button";
import FloatingFileCard from "../../components/common/FloatingFileCard";
import LogoMark from "../../components/common/LogoMark";
import SectionHeader from "../../components/common/SectionHeader";
import { actionCards, features, heroChips, howItWorks, overviewCards, recentActivity } from "../../data/mockData";

function DashboardPreview() {
  return (
    <div className="mx-auto mt-16 max-w-6xl overflow-hidden rounded-[2rem] border border-pilot-line bg-white shadow-pilot">
      <div className="grid min-h-[420px] lg:grid-cols-[190px_1fr]">
        <aside className="hidden bg-pilot-blue p-5 text-white lg:block">
          <div className="flex items-center gap-2 text-sm font-black">
            <GraduationCap size={18} />
            StudyPilot
          </div>
          <div className="mt-8 space-y-2">
            {["Dashboard", "PDF Study Converter", "YouTube Converter", "Resource Hub", "AI Advisor", "Profile"].map((item, index) => (
              <div key={item} className={`rounded-xl px-3 py-2 text-xs font-bold ${index === 0 ? "bg-white text-pilot-blue" : "text-blue-100"}`}>
                {item}
              </div>
            ))}
          </div>
        </aside>
        <section className="bg-pilot-ice p-5 md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-2xl font-black text-pilot-ink">Student workspace preview</h3>
              <p className="mt-1 text-sm text-pilot-muted">Here is what is happening with your academic workspace today.</p>
            </div>
            <div className="rounded-2xl border border-pilot-line bg-white px-4 py-3 text-sm font-bold text-pilot-blue shadow-soft">
              Academic command center
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {overviewCards.map((item) => (
              <div key={item.label} className="rounded-2xl border border-pilot-line bg-white p-4 shadow-soft">
                <item.icon className="text-pilot-blue" size={20} />
                <p className="mt-4 text-2xl font-black text-pilot-ink">{item.value}</p>
                <p className="text-xs font-semibold text-pilot-muted">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.75fr]">
            <div className="grid gap-4 md:grid-cols-2">
              {actionCards.map((item) => (
                <div key={item.title} className="rounded-2xl border border-pilot-line bg-white p-4 shadow-soft">
                  <item.icon className="text-pilot-blue" size={22} />
                  <h4 className="mt-3 font-black text-pilot-ink">{item.title}</h4>
                  <p className="mt-1 text-xs leading-5 text-pilot-muted">{item.text}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-pilot-line bg-white p-5 shadow-soft">
              <h4 className="font-black text-pilot-ink">Study Progress</h4>
              <div className="mt-5 flex h-24 items-end gap-2">
                {[34, 48, 42, 60, 52, 72, 86].map((height, index) => (
                  <div key={index} className="flex-1 rounded-t-xl bg-pilot-blue/80" style={{ height: `${height}%` }} />
                ))}
              </div>
              <h4 className="mt-6 font-black text-pilot-ink">Recent Activity</h4>
              <div className="mt-3 space-y-2">
                {recentActivity.slice(0, 3).map((item) => (
                  <p key={item} className="rounded-xl bg-pilot-soft px-3 py-2 text-xs font-semibold text-pilot-muted">{item}</p>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-pilot-ink">
      <header className="fixed left-0 right-0 top-4 z-50 px-4">
        <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-pilot-line bg-white/90 px-5 py-3 shadow-soft backdrop-blur">
          <Link to="/" aria-label="Go to StudyPilot homepage" className="flex cursor-pointer items-center gap-2 text-lg font-black text-pilot-ink transition hover:opacity-80">
            <LogoMark className="h-9 w-9" />
            StudyPilot
          </Link>
          <div className="hidden items-center gap-7 text-sm font-bold text-pilot-muted lg:flex">
            <a href="#about" className="hover:text-pilot-blue">About</a>
            <a href="#features" className="hover:text-pilot-blue">Features</a>
            <a href="#resources" className="hover:text-pilot-blue">Resources</a>
          </div>
          <Link to="/register">
            <Button className="rounded-full px-5">Get Started</Button>
          </Link>
        </nav>
      </header>

      <main>
        <section id="about" className="hero-fade pilot-grid relative overflow-hidden px-5 pb-20 pt-36">
          <div className="relative mx-auto flex min-h-[560px] max-w-6xl items-center overflow-hidden px-3 py-14 sm:px-8 md:min-h-[620px] md:py-20">
            {heroChips.map((chip, index) => (
              <FloatingFileCard
                key={chip.label}
                {...chip}
                rotate={index % 2 ? "-rotate-3" : "rotate-3"}
                visibility={index < 4 ? "hidden md:flex" : "hidden lg:flex"}
                delay={`${index * 0.18}s`}
              />
            ))}
            <div data-safe-content className="relative z-20 mx-auto max-w-[760px] text-center">
              <h1 className="text-5xl font-black leading-[1.04] tracking-tight text-pilot-ink md:text-7xl">
                Your <span className="inline-flex rounded-[1.25rem] bg-pilot-blue px-4 py-1 text-white shadow-glow">Always On</span> Academic Co Pilot
              </h1>
              <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-pilot-muted md:text-lg">
                StudyPilot helps students get clearer academic guidance, generate quizzes and flashcards from PDFs, discover useful study resources, and stay organized from one clean academic workspace.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <Link to="/register">
                  <Button icon={ArrowRight}>Get Started for Free</Button>
                </Link>
                <a href="#features">
                  <Button variant="secondary">Explore Features</Button>
                </a>
              </div>
            </div>
          </div>
          <DashboardPreview />
        </section>

        <section id="features" className="px-5 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeader eyebrow="Features Section" title="Everything Students Need In One Academic Workspace" />
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Link to={feature.path} key={feature.title} className="rounded-[1.5rem] border border-pilot-line bg-white p-7 text-center shadow-soft transition hover:-translate-y-1 hover:border-pilot-blue hover:shadow-pilot">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue">
                    <feature.icon size={25} />
                  </div>
                  <h3 className="mt-5 text-lg font-black">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-pilot-muted">{feature.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="resources" className="bg-pilot-ice px-5 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeader eyebrow="How It Works Section" title="How StudyPilot Works" text="Simple steps to smarter studying." />
            <div className="relative mt-12 grid gap-5 md:grid-cols-3">
              <div className="absolute left-[18%] right-[18%] top-16 hidden border-t border-dashed border-pilot-blue/40 md:block" />
              {howItWorks.map((step, index) => (
                <div key={step.title} className="relative rounded-[1.5rem] border border-pilot-line bg-white p-8 text-center shadow-soft transition hover:-translate-y-1 hover:border-pilot-blue hover:shadow-pilot">
                  <div className="absolute -top-4 left-1/2 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full bg-pilot-blue text-sm font-black text-white">{index + 1}</div>
                  <div className="mx-auto mt-4 grid h-16 w-16 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue">
                    <step.icon size={28} />
                  </div>
                  <h3 className="mt-5 text-lg font-black">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-pilot-muted">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t border-pilot-line px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 text-sm text-pilot-muted md:flex-row md:items-center md:justify-between">
          <p className="text-lg font-black text-pilot-ink">StudyPilot</p>
          <div className="flex flex-wrap gap-5 font-bold">
            <a href="#about" className="hover:text-pilot-blue">About</a>
            <a href="#features" className="hover:text-pilot-blue">Features</a>
            <a href="#resources" className="hover:text-pilot-blue">Resources</a>
            <a href="mailto:abiodunfaith60@gmail.com?subject=StudyPilot%20Inquiry" className="hover:text-pilot-blue">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
