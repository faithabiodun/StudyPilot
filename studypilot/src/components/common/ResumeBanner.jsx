import { History, X } from "lucide-react";
import Button from "./Button";

function whenLabel(savedAt) {
  if (!savedAt) return "";
  const then = new Date(savedAt);
  if (Number.isNaN(then.getTime())) return "";
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * Offers back work the student did not finish, recalled from Walrus rather than
 * this browser, so it survives a logout, a different device, or a dead battery.
 */
export default function ResumeBanner({ items, onResume, onDismiss }) {
  if (!items?.length) return null;
  const item = items[0];
  const answered = Object.keys(item.payload?.answers || {}).length;
  const total = item.payload?.total;

  return (
    <div className="pilot-pop mb-5 flex flex-col gap-3 rounded-2xl border border-pilot-blue bg-pilot-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <History className="mt-0.5 shrink-0 text-pilot-blue" size={20} />
        <div className="min-w-0">
          <p className="text-sm font-black text-pilot-ink">Pick up where you left off</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-pilot-muted">
            {item.label}
            {total ? ` · ${answered} of ${total} answered` : ""}
            {item.saved_at ? ` · saved ${whenLabel(item.saved_at)}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button onClick={() => onResume(item)}>Resume</Button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid h-9 w-9 place-items-center rounded-xl border border-pilot-line bg-white text-pilot-muted transition hover:text-pilot-blue"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
