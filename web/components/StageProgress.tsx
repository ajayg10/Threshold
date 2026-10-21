import { ProcessingStage } from "@/lib/types";
import { Ear, Languages, ShieldCheck, Check } from "lucide-react";

interface StageProgressProps {
  currentStage?: ProcessingStage;
  className?: string;
}

export default function StageProgress({ currentStage = "heard", className = "" }: StageProgressProps) {
  const stages: { id: ProcessingStage; label: string; icon: typeof Ear }[] = [
    { id: "heard", label: "Heard", icon: Ear },
    { id: "translating", label: "Translating", icon: Languages },
    { id: "checking", label: "Checking safety", icon: ShieldCheck },
  ];

  const getStageIndex = (stage?: ProcessingStage) => {
    if (stage === "translating") return 1;
    if (stage === "checking") return 2;
    return 0;
  };

  const activeIndex = getStageIndex(currentStage);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Processing visitor speech: ${stages[activeIndex].label}`}
      className={`rounded-[16px] border border-[var(--frame)]/40 bg-[var(--surface)] p-5 text-[var(--dusk)] ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--frame-text)]">
          Understanding visitor at door
        </span>
        <span className="text-xs font-bold text-[var(--porch)]">
          Stage {activeIndex + 1} of 3
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stages.map((stage, idx) => {
          const isDone = idx < activeIndex;
          const isCurrent = idx === activeIndex;
          const Icon = stage.icon;

          return (
            <div
              key={stage.id}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-[12px] border p-3 text-center transition-all ${
                isCurrent
                  ? "border-[var(--porch)] bg-[var(--porch-soft)] font-bold text-[var(--dusk)]"
                  : isDone
                  ? "border-[var(--safe)]/40 bg-[var(--safe-bg)]/60 text-[var(--safe)]"
                  : "border-[var(--frame)]/30 bg-transparent text-[var(--frame-text)] opacity-60"
              }`}
            >
              <div className="flex items-center gap-1">
                {isDone ? (
                  <Check className="h-4 w-4 stroke-[3]" />
                ) : (
                  <Icon className={`h-4 w-4 ${isCurrent ? "text-[var(--dusk)]" : ""}`} strokeWidth={2} />
                )}
              </div>
              <span className="text-xs tracking-tight">{stage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
