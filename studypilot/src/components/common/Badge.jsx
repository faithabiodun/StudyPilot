import { cn } from "../../utils/cn";

const variants = {
  blue: "bg-pilot-soft text-pilot-blue",
  green: "bg-emerald-50 text-pilot-green",
  violet: "bg-violet-50 text-pilot-violet",
  amber: "bg-amber-50 text-pilot-amber",
  dark: "bg-pilot-ink text-white"
};

export default function Badge({ children, variant = "blue", className = "" }) {
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-bold", variants[variant], className)}>{children}</span>;
}
