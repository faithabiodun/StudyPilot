import Badge from "../common/Badge";

export default function PageHeader({ eyebrow = "StudyPilot Workspace", title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <Badge variant="blue">{eyebrow}</Badge>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-pilot-ink">{title}</h2>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-pilot-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}
