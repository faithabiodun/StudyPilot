import Badge from "../common/Badge";

export default function FeatureCard({ title, description, icon: Icon }) {
  return (
    <div className="rounded-[1.5rem] border border-pilot-line bg-white p-6 text-pilot-ink shadow-soft transition hover:-translate-y-1 hover:shadow-pilot">
      <div className="mb-5 flex items-center justify-between">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue">
          <Icon size={23} />
        </div>
        <Badge variant="blue">StudyPilot</Badge>
      </div>
      <h3 className="text-xl font-extrabold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-pilot-muted">{description}</p>
    </div>
  );
}
