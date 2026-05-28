import { ExternalLink, Save } from "lucide-react";
import Badge from "../common/Badge";
import Button from "../common/Button";

export default function ResourceCard({ resource, onSave }) {
  return (
    <div className="rounded-xl border border-flight-line bg-flight-card p-5 shadow-panel transition hover:-translate-y-0.5 hover:border-flight-blue">
      <div className="flex flex-wrap gap-2">
        <Badge variant="blue">{resource.type}</Badge>
        <Badge variant="green">{resource.course}</Badge>
        <Badge variant="violet">{resource.difficulty}</Badge>
      </div>
      <h3 className="mt-5 text-xl font-black text-flight-ink">{resource.title}</h3>
      <p className="mt-1 text-sm font-semibold text-flight-blue">{resource.topic}</p>
      <p className="mt-3 text-sm leading-6 text-flight-muted">{resource.description}</p>
      <div className="mt-4 rounded-lg bg-flight-greenSoft p-3 text-xs font-semibold leading-5 text-green-800">{resource.reason}</div>
      <div className="mt-5 flex gap-3">
        <Button icon={ExternalLink} onClick={() => window.open(resource.url, "_blank", "noopener,noreferrer")}>
          Open
        </Button>
        <Button variant="secondary" icon={Save} onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}
