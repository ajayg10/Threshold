"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { RiskBanner, SourceBadges, VisitorTypeBadge } from "@/components/Badges";
import HelpPanel from "@/components/HelpPanel";
import ReplyPanel from "@/components/ReplyPanel";
import { client } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { languageName, sameLanguage, seconds, timeAgo } from "@/lib/labels";
import type { EventRecord, ResidentSettings } from "@/lib/types";

export default function EventPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <Link href="/" className="underline">
        ← All visitors
      </Link>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <EventView />
      </Suspense>
    </main>
  );
}

function EventView() {
  const id = useSearchParams().get("id") ?? "";
  const { data: record, error } = usePoll((signal) => client.event(id, signal), 1000, !!id);
  const [settings, setSettings] = useState<ResidentSettings | null>(null);

  useEffect(() => {
    client.settings().then(setSettings).catch(() => setSettings(null));
  }, []);

  if (!id) return <p className="mt-6">No visitor selected.</p>;
  if (error && !record) {
    return (
      <p role="alert" className="mt-6 font-semibold text-danger">
        {error.message}
      </p>
    );
  }
  if (!record) return <p className="mt-6">Loading…</p>;
  return <VisitorCardView record={record} settings={settings} />;
}

function VisitorCardView({ record, settings }: { record: EventRecord; settings: ResidentSettings | null }) {
  const residentLanguage = settings?.resident_language ?? "en-IN";
  const { card, pipeline } = record;
  return (
    <article aria-labelledby="visitor-heading" className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {card && <VisitorTypeBadge type={card.visitor_type} />}
        <span className="text-muted">
          {record.device_name ?? "Front door"} · <time dateTime={record.created_at}>{timeAgo(record.created_at)}</time>
        </span>
      </div>
      <SourceBadges record={record} />

      {!card ? (
        <div role="status" aria-live="polite" className="card mt-4 p-6">
          <h1 id="visitor-heading" className="text-3xl font-bold">
            {record.status === "error" ? "Could not analyse this visit" : "Interpreting…"}
          </h1>
          <p className="mt-2 text-xl">
            {record.status === "error" ? record.error : "Someone is at the door. Their words appear here in a few seconds."}
          </p>
        </div>
      ) : (
        <>
          <h1 id="visitor-heading" className="mt-3 text-3xl font-bold leading-tight">
            {card.summary}
          </h1>

          <div className="mt-4" aria-live="polite">
            <RiskBanner
              level={card.risk_level}
              flags={card.risk_flags}
              reason={card.escalation.required ? card.escalation.reason : undefined}
              emergency={card.visitor_type === "emergency"}
            />
            <p className="mt-2 text-muted" role="status">
              {pipeline?.policy === "pending" && "Safety check in progress. Risk can only go up from here."}
              {pipeline?.policy === "agent" && "✓ Safety check complete."}
              {pipeline?.policy === "agent_failed" && "Safety check unavailable; built-in safety rules applied."}
            </p>
          </div>

          {card.matched_expected_visit && (
            <p className="badge mt-3 border-ok bg-ok-bg text-base text-ok">
              ✓ Matches expected visit: {card.matched_expected_visit.label}
            </p>
          )}

          {card.transcript && (
            <section aria-label="What they said" className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="card bg-surface p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  They said ({languageName(card.detected_language)})
                </h2>
                <p lang={card.detected_language} className="mt-1 text-xl">
                  {card.transcript}
                </p>
              </div>
              {card.translation && !sameLanguage(card.detected_language, residentLanguage) && (
                <div className="card bg-surface p-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Translation</h2>
                  <p className="mt-1 text-xl">{card.translation}</p>
                </div>
              )}
            </section>
          )}

          <HelpPanel record={record} contacts={settings?.trusted_contacts ?? []} />
          <ReplyPanel eventId={record.event.id} card={card} />

          <details className="mt-6 text-muted">
            <summary className="cursor-pointer font-semibold">How this card was made</summary>
            <ul className="mt-2 list-disc pl-6">
              <li>
                Ready {seconds(Math.max(0, card.timings_ms.total - card.timings_ms.audio))} after the visitor stopped
                speaking (transcribe {seconds(card.timings_ms.transcribe)}, understand {seconds(card.timings_ms.perceive)},
                safety {seconds(card.timings_ms.policy)}).
              </li>
              {pipeline && (
                <li>
                  Audio: {pipeline.audio_source}; transcript: {pipeline.transcript_source}; model:{" "}
                  {pipeline.perception_model ?? "none"}
                  {pipeline.perception_fallback ? " (fallback)" : ""}.
                </li>
              )}
              {pipeline?.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </details>
        </>
      )}
    </article>
  );
}
