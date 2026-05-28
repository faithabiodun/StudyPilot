import { cn } from "../../utils/cn";

export default function Input({ label, error, className = "", ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-2 block text-sm font-semibold text-pilot-ink">{label}</span>}
      <input
        className={cn(
          "w-full rounded-xl border border-pilot-line bg-white px-4 py-3 text-sm text-pilot-ink outline-none transition placeholder:text-pilot-muted/70 focus:border-pilot-blue focus:ring-4 focus:ring-pilot-blue/10",
          error && "border-red-300 focus:border-red-400 focus:ring-red-100",
          className
        )}
        {...props}
      />
      {error && <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}
