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
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6" suppressHydrationWarning>
      <Link href="/" className="inline-flex items-center gap-1.5 text-base font-semibold text-accent hover:underline">
        ← Back to front door
      </Link>
      <Suspense fallback={<p className="mt-6 text-muted">Loading visitor details…</p>}>
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

  if (!id) return <p className="mt-6 text-xl">No visitor selected.</p>;
  if (error && !record) {
    return (
      <div role="alert" className="mt-6 rounded-xl border border-danger/40 bg-danger-bg p-4 font-semibold text-danger">
        ⚠️ {error.message}
      </div>
    );
  }
  if (!record) return <p className="mt-6 text-muted">Loading visitor card…</p>;
  return <VisitorCardView record={record} settings={settings} />;
}

function VisitorCardView({ record, settings }: { record: EventRecord; settings: ResidentSettings | null }) {
  const residentLanguage = settings?.resident_language ?? "en-IN";
  const { card, pipeline } = record;
  const [copied, setCopied] = useState(false);

  function copyTranscript() {
    if (!card) return;
    const textToCopy = card.translation 
      ? `Original (${languageName(card.detected_language)}): ${card.transcript}\nTranslation: ${card.translation}`
      : card.transcript;
    navigator.clipboard?.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <article aria-labelledby="visitor-heading" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {card && <VisitorTypeBadge type={card.visitor_type} />}
          <span className="text-sm font-medium text-muted">
            {record.device_name ?? "Front door"} · <time dateTime={record.created_at}>{timeAgo(record.created_at)}</time>
          </span>
        </div>
        <SourceBadges record={record} />
      </div>

      {!card ? (
        <div role="status" aria-live="polite" className="card mt-6 p-8 text-center sm:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface border border-line shadow-sm text-2xl" aria-hidden="true">
            🎙️
          </div>
          <h1 id="visitor-heading" className="mt-4 text-2xl font-bold">
            {record.status === "error" ? "Could not analyse this visit" : "Interpreting visitor's words…"}
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-lg text-muted">
            {record.status === "error"
              ? record.error
              : "Amazon Transcribe and Bedrock are processing the audio clip. The transcript and replies will appear in 3–4 seconds."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <h1 id="visitor-heading" className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {card.summary}
            </h1>
          </div>

          <div className="mt-4" aria-live="polite">
            <RiskBanner
              level={card.risk_level}
              flags={card.risk_flags}
              reason={card.escalation.required ? card.escalation.reason : undefined}
              emergency={card.visitor_type === "emergency"}
            />
            <div className="mt-2.5 flex items-center gap-2 text-sm text-muted" role="status">
              {pipeline?.policy === "pending" && (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-warn pulse-dot" aria-hidden="true" />
                  <span className="font-semibold text-warn">Strands policy check in progress. Risk level can only go up.</span>
                </>
              )}
              {pipeline?.policy === "agent" && (
                <>
                  <span className="text-ok font-bold">✓</span>
                  <span>Safety and calendar verification complete.</span>
                </>
              )}
              {pipeline?.policy === "agent_failed" && (
                <span>Safety check unavailable; deterministic safety rules applied.</span>
              )}
            </div>
          </div>

          {card.matched_expected_visit && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-ok/40 bg-ok-bg px-3 py-2 text-base font-semibold text-ok">
              <span>✓</span>
              <span>Matches scheduled appointment: {card.matched_expected_visit.label}</span>
            </div>
          )}

          {card.transcript && (
            <section aria-label="What they said" className="mt-6">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-semibold uppercase tracking-wider text-muted">Speech & Translation</span>
                <button
                  type="button"
                  onClick={copyTranscript}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  {copied ? "✓ Copied to clipboard" : "📋 Copy text"}
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="card p-5">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted">
                    <span>Visitor Spoke</span>
                    <span className="rounded bg-surface px-1.5 py-0.5 border border-line">{languageName(card.detected_language)}</span>
                  </div>
                  <p lang={card.detected_language} className="mt-2 text-xl font-medium leading-relaxed">
                    “{card.transcript}”
                  </p>
                </div>
                {card.translation && !sameLanguage(card.detected_language, residentLanguage) && (
                  <div className="card p-5 bg-surface/70">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted">
                      <span>Translated to</span>
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent font-semibold">Your Language</span>
                    </div>
                    <p className="mt-2 text-xl font-medium leading-relaxed">
                      “{card.translation}”
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          <ReplyPanel eventId={record.event.id} card={card} />
          <HelpPanel record={record} contacts={settings?.trusted_contacts ?? []} />

          <details className="mt-8 rounded-xl border border-line bg-surface/50 p-4 text-sm text-muted">
            <summary className="cursor-pointer font-semibold text-foreground">
              🔍 Pipeline provenance & timings
            </summary>
            <ul className="mt-3 space-y-1.5 list-disc pl-5">
              <li>
                Ready <strong>{seconds(Math.max(0, card.timings_ms.total - card.timings_ms.audio))}</strong> after visitor stopped
                speaking (transcribe: {seconds(card.timings_ms.transcribe)}, understand: {seconds(card.timings_ms.perceive)},
                policy check: {seconds(card.timings_ms.policy)}).
              </li>
              {pipeline && (
                <li>
                  Audio source: <code className="font-semibold">{pipeline.audio_source}</code> · Transcript: <code className="font-semibold">{pipeline.transcript_source}</code> · Model:{" "}
                  <code className="font-semibold">{pipeline.perception_model ?? "none"}</code>
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
