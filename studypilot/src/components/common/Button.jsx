import { cn } from "../../utils/cn";

const styles = {
  primary: "bg-pilot-blue text-white shadow-glow hover:bg-blue-700",
  secondary: "bg-white text-pilot-ink border border-pilot-line hover:border-pilot-blue hover:text-pilot-blue",
  dark: "bg-pilot-ink text-white hover:bg-slate-800",
  ghost: "bg-transparent text-pilot-muted hover:bg-pilot-soft hover:text-pilot-blue",
  danger: "bg-red-50 text-red-700 border border-red-100 hover:bg-red-100"
};

export default function Button({ children, variant = "primary", className = "", icon: Icon, ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
        styles[variant],
        className
      )}
      {...props}
    >
      {Icon && <Icon size={17} />}
      {children}
    </button>
  );
}
