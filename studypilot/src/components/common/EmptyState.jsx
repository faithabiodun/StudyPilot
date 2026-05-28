import { Inbox } from "lucide-react";

export default function EmptyState({ title = "Nothing here yet", text = "Your saved academic work will appear here." }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-pilot-line bg-white p-8 text-center shadow-soft">
      <Inbox className="mx-auto mb-3 text-pilot-muted" size={34} />
      <h3 className="text-lg font-bold text-pilot-ink">{title}</h3>
      <p className="mt-1 text-sm text-pilot-muted">{text}</p>
    </div>
  );
}
