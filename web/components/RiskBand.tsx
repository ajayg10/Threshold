import { Level, RiskFlag, VisitorType } from "@/lib/types";
import { getRiskBandCopy, getRiskFlagSentence } from "@/lib/copy";
import { CheckCircle2, AlertTriangle, ShieldAlert, AlertOctagon } from "lucide-react";

interface RiskBandProps {
  riskLevel: Level;
  visitorType: VisitorType;
  summary?: string;
  flags?: RiskFlag[];
  className?: string;
}

export default function RiskBand({
  riskLevel,
  visitorType,
  summary,
  flags = [],
  className = "",
}: RiskBandProps) {
  const isEmergency = visitorType === "emergency";
  const copy = getRiskBandCopy(riskLevel, visitorType, summary);

  if (isEmergency) {
    return (
      <section
        role="alert"
        aria-label="Emergency verdict"
        className={`rounded-[14px] bg-[var(--alarm)] p-4 text-white shadow-sm ${className}`}
      >
        <div className="flex items-start gap-3">
          <AlertOctagon className="h-6 w-6 shrink-0 text-white" strokeWidth={2.5} aria-hidden="true" />
          <div className="space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-white/90">
              Emergency
            </div>
            <p className="text-lg font-bold leading-snug">{copy}</p>
          </div>
        </div>
      </section>
    );
  }

  if (riskLevel === "high") {
    return (
      <section
        role="alert"
        aria-label="High risk alert"
        className={`rounded-[14px] bg-[var(--alarm)] p-4 text-white shadow-sm ${className}`}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-6 w-6 shrink-0 text-white" strokeWidth={2.5} aria-hidden="true" />
          <div className="space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-white/90">
              High risk warning
            </div>
            <p className="text-lg font-bold leading-snug">{copy}</p>
            {flags.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-white/25 pt-2 text-sm font-medium text-white/95">
                {flags.map((flag) => (
                  <li key={flag} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" aria-hidden="true" />
                    <span>{getRiskFlagSentence(flag)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (riskLevel === "medium") {
    return (
      <section
        role="status"
        aria-label="Caution verdict"
        className={`rounded-[14px] border-2 border-[var(--caution-border)] bg-[var(--caution-bg)] p-4 text-[var(--dusk)] ${className}`}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--caution)]" strokeWidth={2.5} aria-hidden="true" />
          <div className="space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--caution)]">
              Caution advised
            </div>
            <p className="text-base font-semibold leading-snug text-[var(--dusk)]">{copy}</p>
            {flags.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-[var(--caution-border)] pt-2 text-sm text-[var(--frame-text)]">
                {flags.map((flag) => (
                  <li key={flag} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--caution)] shrink-0" aria-hidden="true" />
                    <span>{getRiskFlagSentence(flag)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Low Risk: quiet, unobtrusive line with checkmark
  return (
    <section
      role="status"
      aria-label="Low risk verdict"
      className={`flex items-center gap-2.5 rounded-[10px] bg-[var(--safe-bg)] px-3.5 py-2.5 text-[var(--safe)] ${className}`}
    >
      <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--safe)]" strokeWidth={2.5} aria-hidden="true" />
      <span className="text-base font-semibold text-[var(--dusk)]">{copy}</span>
    </section>
  );
}
