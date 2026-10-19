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
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <h1 className="text-3xl font-bold">At the door</h1>
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
      {error && !events.length && (
        <p role="alert" className="mt-4 font-semibold text-danger">
          Cannot reach Threshold: {error.message}
        </p>
      )}
      {loaded && events.length === 0 && (
        <div className="card mt-6 p-6">
          <p className="text-xl">No visitors yet. New visitors appear here within seconds.</p>
          <p className="mt-2 text-muted">
            For a demo, open the <Link href="/demo" className="underline">demo panel</Link>.
          </p>
        </div>
      )}
      <ul className="mt-6 space-y-4">
        {events.map((e) => (
          <EventItem key={e.event.id} record={e} isNew={fresh.has(e.event.id)} />
        ))}
      </ul>
    </main>
  );
}
