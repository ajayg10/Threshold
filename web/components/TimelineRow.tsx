import Link from "next/link";
import { EventRecord } from "@/lib/types";
import { getVisitorTypeLabel, getRiskBandCopy } from "@/lib/copy";
import { Truck, Wrench, UserCheck, Megaphone, HelpCircle, AlertOctagon, VolumeX, ArrowRight } from "lucide-react";

interface TimelineRowProps {
  record: EventRecord;
  isLast?: boolean;
}

export default function TimelineRow({ record, isLast = false }: TimelineRowProps) {
  const card = record.card;
  const visitorType = card?.visitor_type || "unknown";
  const riskLevel = card?.risk_level || "low";
  const label = getVisitorTypeLabel(visitorType);
  const copy = getRiskBandCopy(riskLevel, visitorType, card?.summary);

  const getIcon = () => {
    switch (visitorType) {
      case "delivery":
        return Truck;
      case "service":
        return Wrench;
      case "known_contact":
        return UserCheck;
      case "solicitor":
        return Megaphone;
      case "emergency":
        return AlertOctagon;
      case "no_speech":
        return VolumeX;
      default:
        return HelpCircle;
    }
  };

  const Icon = getIcon();

  const formattedDate = new Date(record.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });

  return (
    <li className="relative flex gap-4 text-left">
      {/* Continuous vertical timeline line */}
      {!isLast && (
        <span
          className="absolute left-4 top-8 -bottom-4 w-[2px] bg-[var(--frame)]/30"
          aria-hidden="true"
        />
      )}

      {/* Node Icon */}
      <div
        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
          riskLevel === "high" || visitorType === "emergency"
            ? "border-[var(--alarm)] bg-[var(--alarm-bg)] text-[var(--alarm)]"
            : riskLevel === "medium"
            ? "border-[var(--caution)] bg-[var(--caution-bg)] text-[var(--caution)]"
            : "border-[var(--frame)] bg-[var(--surface)] text-[var(--dusk)]"
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </div>

      {/* Timeline item content */}
      <div className="flex-1 pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--dusk)]">{label}</span>
            {record.event.source !== "ring_api" && (
              <span className="rounded-full bg-[var(--frame)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--frame-text)]">
                {record.event.source === "seeded" ? "Seeded" : "Simulated"}
              </span>
            )}
          </div>
          <time dateTime={record.created_at} className="text-xs text-[var(--frame-text)]">
            {formattedDate}
          </time>
        </div>

        <div className="mt-1 text-sm font-semibold text-[var(--frame-text)]">
          {copy}
        </div>

        {card?.transcript && (
          <p className="mt-1 line-clamp-2 text-sm text-[var(--dusk)]/80 italic">
            “{card.transcript}”
          </p>
        )}

        {record.replies && record.replies.length > 0 && (
          <div className="mt-2 text-xs font-medium text-[var(--safe)]">
            Replied: “{record.replies[0].resident_text}”
          </div>
        )}

        <div className="mt-2">
          <Link
            href={`/event?id=${encodeURIComponent(record.event.id)}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--dusk)] hover:underline"
          >
            <span>View visit details</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </li>
  );
}
