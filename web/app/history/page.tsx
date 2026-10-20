"use client";

import Link from "next/link";
import { useState } from "react";
import { useEvents } from "@/lib/hooks";
import { RISK, VISITOR_TYPE } from "@/lib/labels";
import type { Level } from "@/lib/types";

/** Past visits and what happened (replies sent, contacts alerted). Kept for the retention period only. */
export default function HistoryPage() {
  const { events, loaded, error } = useEvents(5000);
  const [filter, setFilter] = useState<"all" | Level | "emergency">("all");
  const [query, setQuery] = useState("");

  const filtered = events.filter((e) => {
    if (filter === "emergency") {
      if (e.card?.visitor_type !== "emergency") return false;
    } else if (filter !== "all") {
      if (e.card?.risk_level !== filter) return false;
    }
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const summary = e.card?.summary.toLowerCase() ?? "";
    const transcript = e.card?.transcript.toLowerCase() ?? "";
    return summary.includes(q) || transcript.includes(q);
  });

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Visit History</h1>
          <p className="mt-1 text-sm text-muted">
            Transcripts kept strictly for retention period. Audio is never stored.
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface border border-line text-muted">
          Auto-purged after retention
        </span>
      </div>

      {error && !events.length && (
        <div role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger-bg p-4 font-semibold text-danger">
          ⚠️ {error.message}
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`btn text-xs py-1.5 px-3 min-h-[2.25rem] ${filter === "all" ? "btn-primary" : "bg-surface"}`}
              onClick={() => setFilter("all")}
            >
              All ({events.length})
            </button>
            <button
              type="button"
              className={`btn text-xs py-1.5 px-3 min-h-[2.25rem] ${filter === "low" ? "btn-primary" : "bg-surface"}`}
              onClick={() => setFilter("low")}
            >
              🟢 Safe / Low Risk
            </button>
            <button
              type="button"
              className={`btn text-xs py-1.5 px-3 min-h-[2.25rem] ${filter === "high" ? "btn-danger" : "bg-surface"}`}
              onClick={() => setFilter("high")}
            >
              🔴 High Risk / Pretext
            </button>
            <button
              type="button"
              className={`btn text-xs py-1.5 px-3 min-h-[2.25rem] ${filter === "emergency" ? "btn-danger" : "bg-surface"}`}
              onClick={() => setFilter("emergency")}
            >
              🚨 Emergency
            </button>
          </div>

          <div className="sm:w-64">
            <input
              type="search"
              placeholder="Search past visits…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field text-sm min-h-[2.25rem] py-1"
            />
          </div>
        </div>
      )}

      {loaded && events.length === 0 && (
        <div className="card mt-8 p-12 text-center">
          <p className="text-2xl font-bold">No visits recorded</p>
          <p className="mt-2 text-base text-muted">When visitors ring the doorbell, their visit summary will be preserved here.</p>
          <Link href="/demo" className="btn btn-primary mt-6">
            ▶ Test with a demo visitor
          </Link>
        </div>
      )}

      {events.length > 0 && filtered.length === 0 && (
        <p className="mt-8 text-center text-muted">No visits match your filter.</p>
      )}

      <ol className="mt-4 space-y-3">
        {filtered.map((e) => {
          const outcome = [
            e.replies.length ? `💬 ${e.replies.length} repl${e.replies.length === 1 ? "y" : "ies"} sent` : "No reply",
            ...e.escalations.map((x) => `👪 ${x.contact_name} alerted`),
          ].join(" · ");

          return (
            <li key={e.event.id}>
              <Link
                href={`/event?id=${encodeURIComponent(e.event.id)}`}
                className="card block p-4 hover:border-accent transition-all hover:shadow-md"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden="true">
                      {e.card ? VISITOR_TYPE[e.card.visitor_type].icon : "🔔"}
                    </span>
                    <span className="font-bold text-lg">
                      {e.card ? VISITOR_TYPE[e.card.visitor_type].label : e.status}
                    </span>
                    {e.card && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                        e.card.risk_level === "high" 
                          ? "bg-danger-bg text-danger border-danger/40" 
                          : e.card.risk_level === "medium"
                          ? "bg-warn-bg text-warn border-warn/40"
                          : "bg-ok-bg text-ok border-ok/40"
                      }`}>
                        {RISK[e.card.risk_level].icon} {RISK[e.card.risk_level].label}
                      </span>
                    )}
                  </div>
                  <time dateTime={e.created_at} className="text-xs text-muted font-medium">
                    {new Date(e.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>

                {e.card && <p className="mt-2 text-base font-medium">{e.card.summary}</p>}

                <div className="mt-3 flex items-center justify-between text-xs text-muted border-t border-line/40 pt-2">
                  <span>{outcome}</span>
                  <span className="text-accent font-semibold">View details →</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
