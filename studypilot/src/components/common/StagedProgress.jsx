import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * Shows what StudyPilot is actually doing while a slow request runs.
 *
 * The backend does not stream progress, so the phases advance on their own
 * estimated timings. The bar is deliberately capped below full and the final
 * phase keeps running until the real request resolves, so it never claims to
 * be finished before it is.
 */
export default function StagedProgress({ steps = [], note = "" }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000);
    }, 250);
    return () => window.clearInterval(timer);
    // Restarting whenever the phase list changes keeps the timer aligned with
    // the run it is describing.
  }, [steps.map((step) => step.label).join("|")]);

  if (!steps.length) return null;

  const totalSeconds = steps.reduce((sum, step) => sum + step.seconds, 0);

  let activeIndex = steps.length - 1;
  let boundary = 0;
  for (let index = 0; index < steps.length; index += 1) {
    boundary += steps[index].seconds;
    if (elapsed < boundary) {
      activeIndex = index;
      break;
    }
  }

  // Ease toward 92% so a slow run still looks alive without ever reading done.
  const ratio = Math.min(elapsed / totalSeconds, 1);
  const percent = Math.min(92, Math.round(ratio * 92));
  const overrunning = elapsed > totalSeconds;
  const seconds = Math.floor(elapsed);

  return (
    <div className="mt-4 rounded-2xl border border-blue-100 bg-pilot-soft px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Loader2 className="shrink-0 animate-spin text-pilot-blue" size={16} />
          <p className="truncate text-sm font-bold text-pilot-blue">{steps[activeIndex].label}</p>
        </div>
        <p className="shrink-0 text-xs font-bold tabular-nums text-pilot-muted">{seconds}s</p>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-pilot-blue transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {steps.map((step, index) => (
          <span
            key={step.label}
            className={`inline-flex items-center gap-1 text-xs font-bold ${
              index < activeIndex ? "text-pilot-green" : index === activeIndex ? "text-pilot-blue" : "text-pilot-muted"
            }`}
          >
            {index < activeIndex ? <Check size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            {step.short || step.label}
          </span>
        ))}
      </div>

      {(note || overrunning) && (
        <p className="mt-3 text-xs font-semibold leading-5 text-pilot-muted">
          {overrunning ? "This one is taking a little longer than usual. Still working, please keep this open." : note}
        </p>
      )}
    </div>
  );
}
