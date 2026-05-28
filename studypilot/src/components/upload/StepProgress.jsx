import { CheckCircle2 } from "lucide-react";

export default function StepProgress({ steps, activeStep = 1 }) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const active = stepNumber <= activeStep;
        return (
          <div key={step} className="flex items-center gap-3">
            <div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${active ? "bg-flight-green text-white" : "bg-white text-flight-muted border border-flight-line"}`}>
              {active ? <CheckCircle2 size={16} /> : stepNumber}
            </div>
            <span className={`text-sm font-semibold ${active ? "text-flight-ink" : "text-flight-muted"}`}>{step}</span>
          </div>
        );
      })}
    </div>
  );
}
