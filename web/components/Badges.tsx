import { FLAG, RISK, VISITOR_TYPE, provenanceBadges } from "@/lib/labels";
import type { EventRecord, Level, RiskFlag, VisitorType } from "@/lib/types";

const TONE = {
  ok: "bg-ok-bg text-ok border-ok",
  warn: "bg-warn-bg text-warn border-warn",
  danger: "bg-danger-bg text-danger border-danger",
} as const;

export function VisitorTypeBadge({ type }: { type: VisitorType }) {
  const t = VISITOR_TYPE[type];
  return (
    <span className="badge text-base">
      <span aria-hidden="true">{t.icon}</span>
      {t.label}
    </span>
  );
}

const EMERGENCY = { label: "Emergency reported: stay safe and call for help", icon: "🔥", tone: "danger" } as const;

/** Colour + icon + text, never colour alone. Emergencies get their own message: someone warning you
 * about smoke needs "call for help", not "do not open the door". */
export function RiskBanner({
  level,
  flags,
  reason,
  emergency = false,
  compact = false,
}: {
  level: Level;
  flags: RiskFlag[];
  reason?: string;
  emergency?: boolean;
  compact?: boolean;
}) {
  const r = emergency ? EMERGENCY : RISK[level];
  return (
    <div className={`rounded-xl border-2 ${TONE[r.tone]} ${compact ? "px-3 py-1" : "p-4"}`}>
      <p className={`font-bold ${compact ? "" : "text-xl"}`}>
        <span aria-hidden="true">{r.icon} </span>
        {r.label}
      </p>
      {!compact && flags.length > 0 && (
        <ul className="mt-2 list-disc pl-6">
          {flags.map((f) => (
            <li key={f}>{FLAG[f]}</li>
          ))}
        </ul>
      )}
      {!compact && reason && <p className="mt-2">{reason}</p>}
    </div>
  );
}

/** Discloses seeded / simulated / cached data on every event. */
export function SourceBadges({ record }: { record: EventRecord }) {
  const badges = provenanceBadges(record);
  if (!badges.length) return null;
  return (
    <ul aria-label="Data sources" className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <li key={b} className="badge">
          {b}
        </li>
      ))}
    </ul>
  );
}
