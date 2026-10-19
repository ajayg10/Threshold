import Link from "next/link";
import { RiskBanner, SourceBadges, VisitorTypeBadge } from "@/components/Badges";
import { timeAgo } from "@/lib/labels";
import type { EventRecord } from "@/lib/types";

export default function EventItem({ record, isNew = false }: { record: EventRecord; isNew?: boolean }) {
  const { card } = record;
  const href = `/event?id=${encodeURIComponent(record.event.id)}`;
  return (
    <li className={`card p-4 ${isNew ? "arrival" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {card ? (
          <VisitorTypeBadge type={card.visitor_type} />
        ) : (
          <span className="badge text-base">{record.status === "error" ? "Could not analyse" : "Listening…"}</span>
        )}
        <span className="text-muted">
          {record.event.type === "ding" ? "Doorbell" : "Motion"} · {record.device_name ?? "Front door"} ·{" "}
          <time dateTime={record.created_at}>{timeAgo(record.created_at)}</time>
        </span>
      </div>
      {card ? (
        <>
          <p className="mt-2 text-xl font-semibold">{card.summary}</p>
          <div className="mt-2">
            <RiskBanner
              level={card.risk_level}
              flags={card.risk_flags}
              emergency={card.visitor_type === "emergency"}
              compact
            />
          </div>
        </>
      ) : (
        <p className="mt-2 text-xl">{record.status === "error" ? record.error : "Someone is at the door. Interpreting…"}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <SourceBadges record={record} />
        <Link href={href} className="btn btn-primary">
          Open<span className="sr-only"> visitor card</span>
        </Link>
      </div>
    </li>
  );
}
