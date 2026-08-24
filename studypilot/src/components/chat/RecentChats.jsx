import { MessageSquare, Plus } from "lucide-react";

function relativeDay(value) {
  if (!value) return "";
  const then = new Date(value);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Recent conversations, newest first. Selecting one reloads its messages and
 * continues it, so a follow-up lands in the same thread rather than opening a
 * new one.
 */
export default function RecentChats({ sessions, activeId, onSelect, onNew, loading }) {
  return (
    <div className="rounded-[1.75rem] border border-pilot-line bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black text-pilot-ink">Recent Chats</h3>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1 rounded-xl border border-pilot-line px-3 py-1.5 text-xs font-black text-pilot-blue transition hover:border-pilot-blue hover:bg-pilot-soft"
        >
          <Plus size={14} />
          New
        </button>
      </div>

      {loading && <p className="mt-4 text-sm font-semibold text-pilot-muted">Loading your chats...</p>}

      {!loading && !sessions.length && (
        <p className="mt-4 rounded-2xl border border-dashed border-pilot-line bg-pilot-ice px-4 py-5 text-sm font-semibold leading-6 text-pilot-muted">
          Your conversations will appear here once you ask your first question.
        </p>
      )}

      {!loading && sessions.length > 0 && (
        <div className="scrollbar-soft mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {sessions.map((session) => {
            const active = session.id === activeId;
            const count = session.messages?.length || 0;
            return (
              <button
                key={session.id}
                onClick={() => onSelect(session)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                  active
                    ? "border-pilot-blue bg-pilot-soft shadow-soft"
                    : "border-pilot-line bg-pilot-ice hover:-translate-y-0.5 hover:border-pilot-blue hover:bg-white hover:shadow-soft"
                }`}
              >
                <MessageSquare size={16} className={`mt-0.5 shrink-0 ${active ? "text-pilot-blue" : "text-pilot-muted"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`line-clamp-2 block text-sm font-bold leading-5 ${active ? "text-pilot-blue" : "text-pilot-ink"}`}>
                    {session.title || "Untitled chat"}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-pilot-muted">
                    {relativeDay(session.updated_at)}
                    {count ? ` · ${count} message${count === 1 ? "" : "s"}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
