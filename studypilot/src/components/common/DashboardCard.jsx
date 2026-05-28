export default function DashboardCard({ title, children, className = "" }) {
  return (
    <section className={`rounded-[1.75rem] border border-pilot-line bg-white p-6 shadow-soft ${className}`}>
      {title && <h3 className="text-xl font-black text-pilot-ink">{title}</h3>}
      {children}
    </section>
  );
}
