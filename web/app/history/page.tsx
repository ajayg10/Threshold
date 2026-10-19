"use client";

import Link from "next/link";
import { useEvents } from "@/lib/hooks";
import { RISK, VISITOR_TYPE } from "@/lib/labels";

/** Past visits and what happened (replies sent, contacts alerted). Kept for the retention period only. */
export default function HistoryPage() {
  const { events, loaded, error } = useEvents(5000);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <h1 className="text-3xl font-bold">History</h1>
      <p className="text-muted">Only text is kept, never audio, and only for your retention period (see Settings).</p>
      {error && !events.length && (
        <p role="alert" className="mt-4 font-semibold text-danger">
          {error.message}
        </p>
      )}
      {loaded && events.length === 0 && <p className="mt-6 text-xl">No visits yet.</p>}
      <ol className="mt-4 divide-y divide-line">
        {events.map((e) => {
          const outcome = [
            e.replies.length ? `${e.replies.length} repl${e.replies.length === 1 ? "y" : "ies"} sent` : "No reply",
            ...e.escalations.map((x) => `${x.contact_name} alerted${x.channel === "simulated" ? " (simulated)" : ""}`),
          ].join(" · ");
          return (
            <li key={e.event.id} className="py-3">
              <Link href={`/event?id=${encodeURIComponent(e.event.id)}`} className="block rounded-lg p-2 hover:bg-surface">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xl font-semibold">
                    <span aria-hidden="true">{e.card ? VISITOR_TYPE[e.card.visitor_type].icon : "…"} </span>
                    {e.card ? VISITOR_TYPE[e.card.visitor_type].label : e.status}
                  </span>
                  <time dateTime={e.created_at} className="text-muted">
                    {new Date(e.created_at).toLocaleString()}
                  </time>
                </span>
                {e.card && <span className="mt-1 block">{e.card.summary}</span>}
                <span className="mt-1 block text-muted">
                  {e.card && (
                    <>
                      <span aria-hidden="true">{RISK[e.card.risk_level].icon} </span>
                      {RISK[e.card.risk_level].label} ·{" "}
                    </>
                  )}
                  {outcome}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
