"use client";

import { useState } from "react";
import TimelineRow from "@/components/TimelineRow";
import { useEvents } from "@/lib/hooks";
import { Level } from "@/lib/types";
import { Search } from "lucide-react";

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
    const summary = e.card?.summary.toLowerCase() || "";
    const transcript = e.card?.transcript.toLowerCase() || "";
    return summary.includes(q) || transcript.includes(q);
  });

  return (
    <div className="mx-auto w-full max-w-2xl text-[var(--dusk)]">
      {/* Page Header */}
      <div className="border-b border-[var(--frame)]/30 pb-4">
        <h1 className="font-display text-2xl md:text-3xl font-black tracking-tight">
          Visit history
        </h1>
        <p className="mt-1 text-sm text-[var(--frame-text)]">
          Continuous record of visits at your door. Transcripts kept according to retention policy.
        </p>
      </div>

      {/* Filter Chips & Search Bar */}
      {events.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter visits by risk">
              {[
                { id: "all", label: "All visits" },
                { id: "low", label: "Low risk" },
                { id: "medium", label: "Caution" },
                { id: "high", label: "High risk" },
                { id: "emergency", label: "Emergency" },
              ].map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id as any)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                      active
                        ? "bg-[var(--dusk)] text-white"
                        : "border border-[var(--frame)]/40 bg-[var(--surface)] text-[var(--frame-text)] hover:text-[var(--dusk)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--frame-text)]" />
              <input
                type="search"
                placeholder="Search visits..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-full border border-[var(--frame)]/40 bg-[var(--surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--dusk)] focus:border-[var(--dusk)]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !events.length && (
        <div role="alert" className="mt-6 rounded-[14px] bg-[var(--alarm-bg)] p-4 text-sm font-semibold text-[var(--alarm)]">
          Could not load visit history: {error.message}
        </div>
      )}

      {/* Empty State */}
      {loaded && events.length === 0 && (
        <div className="my-16 text-center">
          <p className="text-xl font-bold font-display">No visits recorded yet</p>
          <p className="mt-2 text-sm text-[var(--frame-text)]">
            When someone rings your doorbell or approaches the threshold, the interaction will be logged here.
          </p>
        </div>
      )}

      {events.length > 0 && filtered.length === 0 && (
        <p className="my-12 text-center text-sm text-[var(--frame-text)]">
          No visits match your filter criteria.
        </p>
      )}

      {/* Continuous Chronological Timeline List */}
      {filtered.length > 0 && (
        <ol className="mt-8 space-y-0" aria-label="Timeline of past visits">
          {filtered.map((record, index) => (
            <TimelineRow
              key={record.event.id}
              record={record}
              isLast={index === filtered.length - 1}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
