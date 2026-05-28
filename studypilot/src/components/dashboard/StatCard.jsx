export default function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-[1.5rem] border border-pilot-line bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-black text-pilot-ink">{value}</p>
          <p className="mt-1 text-sm font-semibold text-pilot-muted">{label}</p>
        </div>
        {Icon && (
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue">
            <Icon size={22} />
          </div>
        )}
      </div>
    </div>
  );
}
