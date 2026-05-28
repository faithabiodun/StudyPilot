export default function FloatingFileCard({ label, icon: Icon, className = "", rotate = "rotate-0", visibility = "hidden lg:flex", delay = "0s" }) {
  return (
    <div
      data-float-card
      className={`pointer-events-none absolute z-10 ${visibility} animate-[heroFloat_5s_ease-in-out_infinite] items-center gap-2 rounded-2xl border border-pilot-line bg-white/95 px-4 py-3 text-xs font-black text-pilot-ink shadow-soft ${rotate} ${className}`}
      style={{ animationDelay: delay }}
    >
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-pilot-soft text-pilot-blue">
        <Icon size={16} />
      </span>
      {label}
    </div>
  );
}
