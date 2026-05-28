export default function SectionHeader({ eyebrow, title, text, centered = true }) {
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      {eyebrow && <span className="inline-flex rounded-full bg-pilot-soft px-4 py-2 text-sm font-black text-pilot-blue">{eyebrow}</span>}
      <h2 className="mt-5 text-3xl font-black tracking-tight text-pilot-ink md:text-5xl">{title}</h2>
      {text && <p className="mt-4 text-base leading-8 text-pilot-muted">{text}</p>}
    </div>
  );
}
