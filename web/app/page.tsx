"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import EventItem from "@/components/EventItem";
import { useEvents } from "@/lib/hooks";
import { VISITOR_TYPE } from "@/lib/labels";

/** Door: live feed of visitors. New arrivals get a slow visual pulse, a vibration where supported,
 * and a screen-reader announcement. Nothing relies on sound. */
export default function DoorPage() {
  const { events, loaded, error } = useEvents(1000);
  const seen = useRef<Set<string> | null>(null);
  const announced = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!loaded) return;
    if (seen.current === null) {
      // First successful load: existing events are not "new".
      seen.current = new Set(events.map((e) => e.event.id));
      events.forEach((e) => e.card && announced.current.add(e.event.id));
      return;
    }
    const arrivals = events.filter((e) => !seen.current!.has(e.event.id));
    if (arrivals.length) {
      arrivals.forEach((e) => seen.current!.add(e.event.id));
      setFresh((prev) => new Set([...prev, ...arrivals.map((e) => e.event.id)]));
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        /* not supported (e.g. iOS Safari): the visual cue still shows */
      }
    }
    const ready = events.find((e) => e.card && !announced.current.has(e.event.id));
    if (ready?.card) {
      announced.current.add(ready.event.id);
      setAnnouncement(`New visitor. ${VISITOR_TYPE[ready.card.visitor_type].label}. ${ready.card.summary}`);
    }
  }, [events, loaded]);

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6" suppressHydrationWarning>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">At the front door</h1>
          <p className="mt-1 text-base text-muted">
            Live visitor notifications with transcription, translation, and safe one-tap replies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/demo" className="btn btn-primary text-sm">
            ▶ Test a Visitor
          </Link>
          <Link href="/door" target="_blank" className="btn text-sm">
            Open Display ↗
          </Link>
        </div>
      </div>

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      {error && !events.length && (
        <div role="alert" className="mt-6 rounded-xl border border-danger/40 bg-danger-bg p-4 text-base font-semibold text-danger">
          ⚠️ Cannot reach Threshold backend: {error.message}
        </div>
      )}

      {loaded && events.length === 0 && (
        <div className="card mt-8 p-8 text-center sm:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface border border-line shadow-sm text-3xl" aria-hidden="true">
            🔔
          </div>
          <h2 className="mt-4 text-2xl font-bold">No visitors right now</h2>
          <p className="mx-auto mt-2 max-w-md text-base text-muted">
            The listener is active. Whenever a Ring doorbell press or motion occurs, the visitor card appears here automatically.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demo" className="btn btn-primary">
              ▶ Try a Demo Visitor (e.g. Hindi Delivery)
            </Link>
            <Link href="/door" target="_blank" className="btn">
              🖥 Open Door Display Tablet
            </Link>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wider text-muted">
              Recent Activity ({events.length})
            </span>
            <span className="text-xs text-muted">Auto-updating live</span>
          </div>
          <ul className="space-y-4">
            {events.map((e) => (
              <EventItem key={e.event.id} record={e} isNew={fresh.has(e.event.id)} />
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
