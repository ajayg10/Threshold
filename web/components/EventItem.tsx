import Link from "next/link";
import { RiskBanner, SourceBadges, VisitorTypeBadge } from "@/components/Badges";
import { timeAgo } from "@/lib/labels";
import type { EventRecord } from "@/lib/types";

export default function EventItem({ record, isNew = false }: { record: EventRecord; isNew?: boolean }) {
  const { card } = record;
  const href = `/event?id=${encodeURIComponent(record.event.id)}`;
  return (
    <li className={`card p-5 transition-all hover:border-accent/60 ${isNew ? "arrival ring-2 ring-focus" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/50 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {card ? (
            <VisitorTypeBadge type={card.visitor_type} />
          ) : (
            <span className="badge text-base bg-surface border-line">
              <span className="h-2 w-2 rounded-full bg-accent pulse-dot" aria-hidden="true" />
              {record.status === "error" ? "Could not analyse" : "Interpreting speech…"}
            </span>
          )}
          <span className="text-sm font-medium text-muted">
            {record.event.type === "ding" ? "🔔 Doorbell" : "🏃 Motion"} · {record.device_name ?? "Front door"}
          </span>
        </div>
        <time dateTime={record.created_at} className="text-sm text-muted font-medium">
          {timeAgo(record.created_at)}
        </time>
      </div>

      <div className="py-3">
        {card ? (
          <>
            <p className="text-xl font-bold leading-snug">{card.summary}</p>
            <div className="mt-3">
              <RiskBanner
                level={card.risk_level}
                flags={card.risk_flags}
                emergency={card.visitor_type === "emergency"}
                compact
              />
            </div>
          </>
        ) : (
          <p className="text-lg text-muted">{record.status === "error" ? record.error : "Someone is at the door. Words appear in seconds…"}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/50 pt-3">
        <SourceBadges record={record} />
        <Link href={href} className="btn btn-primary text-base ml-auto">
          View & Reply →
        </Link>
      </div>
    </li>
  );
}
