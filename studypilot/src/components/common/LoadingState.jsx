export default function LoadingState({ text = "Loading academic context..." }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-pilot-soft px-4 py-3 text-sm font-semibold text-pilot-blue">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-pilot-blue" />
      {text}
    </div>
  );
}
