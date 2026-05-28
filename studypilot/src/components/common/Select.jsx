import { cn } from "../../utils/cn";

export default function Select({ label, children, className = "", ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-2 block text-sm font-semibold text-pilot-ink">{label}</span>}
      <select
        className={cn(
          "w-full rounded-xl border border-pilot-line bg-white px-4 py-3 text-sm text-pilot-ink outline-none transition focus:border-pilot-blue focus:ring-4 focus:ring-pilot-blue/10",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
