"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import VisitorCardView from "@/components/VisitorCardView";
import { client } from "@/lib/api";
import { useEvents } from "@/lib/hooks";
import { EventRecord, ResidentSettings } from "@/lib/types";
import { ArrowRight } from "lucide-react";
import { getVisitorTypeLabel } from "@/lib/copy";

export default function DoorPage() {
  const { events, loaded, error } = useEvents(1000);
  const [settings, setSettings] = useState<ResidentSettings | null>(null);
  const [isNewArrival, setIsNewArrival] = useState(false);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    client.settings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const latestEvent: EventRecord | null = events.length > 0 ? events[0] : null;

  // Porch light wash trigger on new event arrival
  useEffect(() => {
    if (!latestEvent) return;

    if (lastEventIdRef.current && lastEventIdRef.current !== latestEvent.event.id) {
      setIsNewArrival(true);
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        // vibration unsupported
      }
      const timer = setTimeout(() => setIsNewArrival(false), 800);
      lastEventIdRef.current = latestEvent.event.id;
      return () => clearTimeout(timer);
    }

    lastEventIdRef.current = latestEvent.event.id;
  }, [latestEvent?.event.id]);

  const handleReply = async (body: { reply_id: string } | { text: string }) => {
    if (!latestEvent) return;
    await client.reply(latestEvent.event.id, body);
  };

  const handleEscalate = async (contactId?: string) => {
    if (!latestEvent) return;
    await client.escalate(latestEvent.event.id, contactId);
  };

  const previousVisits = events.slice(1, 4);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
      {/* Live announcement region for screen readers */}
      <div
        aria-live={latestEvent?.card?.risk_level === "high" || latestEvent?.card?.visitor_type === "emergency" ? "assertive" : "polite"}
        className="sr-only"
        role="status"
      >
        {latestEvent?.card
          ? `Visitor at door: ${latestEvent.card.visitor_type}. ${latestEvent.card.summary}`
          : "Threshold listening."}
      </div>

      {/* Hero Visitor Card Container */}
      <VisitorCardView
        record={latestEvent}
        trustedContacts={settings?.trusted_contacts || []}
        onReply={handleReply}
        onEscalate={handleEscalate}
        isNewArrival={isNewArrival}
        isOffline={!loaded && !!error}
      />

      {/* Concise previous visits anchor below hero card */}
      {previousVisits.length > 0 && (
        <section aria-label="Previous visits" className="mt-8 w-full border-t border-[var(--frame)]/30 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--frame-text)]">
              Previous visits
            </span>
            <Link
              href="/history"
              className="inline-flex items-center gap-1 text-xs font-bold text-[var(--dusk)] hover:underline"
            >
              <span>View full history ({events.length})</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-2 divide-y divide-[var(--frame)]/20">
            {previousVisits.map((e) => (
              <div key={e.event.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--dusk)]">
                    {e.card ? getVisitorTypeLabel(e.card.visitor_type) : "Visitor"}
                  </span>
                  <span className="text-xs text-[var(--frame-text)] truncate max-w-[200px] sm:max-w-xs">
                    {e.card?.summary || "Visit at the door"}
                  </span>
                </div>
                <Link
                  href={`/event?id=${encodeURIComponent(e.event.id)}`}
                  className="text-xs font-semibold text-[var(--frame-text)] hover:text-[var(--dusk)] hover:underline shrink-0"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
