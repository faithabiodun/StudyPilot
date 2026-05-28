import { CheckCircle2 } from "lucide-react";

export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-pilot-ink px-4 py-3 text-sm font-semibold text-white shadow-pilot">
      <CheckCircle2 size={18} className="text-emerald-300" />
      {message}
    </div>
  );
}
