import { FileText } from "lucide-react";

export default function SourceCard({ title, detail }) {
  return (
    <div className="rounded-lg border border-flight-line bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-extrabold text-flight-ink">
        <FileText size={16} className="text-flight-green" />
        {title}
      </div>
      <p className="mt-2 text-xs leading-5 text-flight-muted">{detail || "Referenced academic source used for grounded response."}</p>
    </div>
  );
}
