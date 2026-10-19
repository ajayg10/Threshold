"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { client } from "@/lib/api";
import { useEvents, usePoll } from "@/lib/hooks";
import { languageName, seconds, VISITOR_TYPE } from "@/lib/labels";
import type { EventRecord, RingStatus, Scenario } from "@/lib/types";

/** Hidden demo panel: seeded scenarios through the real pipeline, reset, per-stage latency, and
 * honest disclosure of what is seeded, simulated or cached. */
export default function DemoPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [ring, setRing] = useState<RingStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const { data: health } = usePoll((signal) => client.health(signal), 10000);
  const { events, reload } = useEvents(1000);

  useEffect(() => {
    client.scenarios().then(setScenarios).catch((e: Error) => setMessage(e.message));
    client.ringStatus().then(setRing).catch(() => setRing(null));
  }, []);

  async function trigger(s: Scenario) {
    setBusy(s.id);
    setMessage("");
    try {
      const r = await client.trigger(s.id);
      setMessage(`${s.id}: ${r.result.status} (webhook accepted in ${r.ingest_ms} ms)`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    try {
      await client.reset();
      reload();
      setMessage("Reset: events cleared, seeded resident restored.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <h1 className="text-3xl font-bold">Demo panel</h1>

      <section aria-label="Disclosure" className="card mt-4 space-y-1 bg-surface p-4">
        <p>
          <strong>Events:</strong> Threshold&apos;s own <strong>test harness</strong> (not a Ring simulator) sends signed
          Ring-format webhooks through the real webhook handler.
        </p>
        <p>
          <strong>Audio:</strong> seeded clips synthesized with Amazon Polly. Transcription, understanding and replies run
          live on AWS.
        </p>
        <p>
          <strong>Transcripts:</strong>{" "}
          {health?.precomputed_transcripts ? (
            <span className="font-semibold text-warn">⚠ PRECOMPUTED_TRANSCRIPTS is ON: cached Transcribe output is used.</span>
          ) : (
            "live Amazon Transcribe (PRECOMPUTED_TRANSCRIPTS is off)."
          )}
        </p>
        <p>
          <strong>Ring API:</strong>{" "}
          {ring === null
            ? "checking…"
            : ring.configured
              ? ring.linked
                ? `linked (${ring.mode}), devices: ${ring.devices?.join(", ")}`
                : `configured but not reachable: ${ring.error}`
              : "no Ring credentials configured; using the test harness."}
        </p>
      </section>

      <section aria-labelledby="scenarios-heading" className="mt-6">
        <h2 id="scenarios-heading" className="text-2xl font-bold">
          Scenarios
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {scenarios.map((s) => (
            <button key={s.id} type="button" className="btn justify-start" disabled={busy !== null} onClick={() => trigger(s)}>
              <span className="flex flex-col items-start">
                <span>{busy === s.id ? "Ringing…" : s.label}</span>
                <span className="text-sm font-normal text-muted">
                  {s.id} · {s.event_type === "ding" ? "doorbell" : "motion"} · {languageName(s.language)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={reset} disabled={busy !== null}>
            Reset demo
          </button>
          <Link href="/door" className="btn" target="_blank">
            Open Door Display ↗
          </Link>
        </div>
        <p role="status" aria-live="polite" className="mt-2">
          {message}
        </p>
      </section>

      <section aria-labelledby="latency-heading" className="mt-6">
        <h2 id="latency-heading" className="text-2xl font-bold">
          Latency per stage
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Pipeline timings for recent events</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3">Visitor</th>
                <th scope="col" className="py-2 pr-3">Clip</th>
                <th scope="col" className="py-2 pr-3">Transcribe</th>
                <th scope="col" className="py-2 pr-3">Understand</th>
                <th scope="col" className="py-2 pr-3">Safety</th>
                <th scope="col" className="py-2 pr-3">After speech</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 10).map((e) => (
                <LatencyRow key={e.event.id} record={e} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function LatencyRow({ record }: { record: EventRecord }) {
  const c = record.card;
  const t = c?.timings_ms;
  const pending = record.pipeline?.policy === "pending";
  return (
    <tr className="border-b border-line align-top">
      <th scope="row" className="py-2 pr-3 font-normal">
        <Link href={`/event?id=${encodeURIComponent(record.event.id)}`} className="underline">
          {c ? VISITOR_TYPE[c.visitor_type].label : record.status}
        </Link>
        {record.pipeline && (
          <span className="block text-sm text-muted">
            {record.pipeline.transcript_source}
            {record.pipeline.policy !== "fast_path" ? ` · agent: ${record.pipeline.policy}` : ""}
          </span>
        )}
      </th>
      <td className="py-2 pr-3">{t ? seconds(t.audio) : "…"}</td>
      <td className="py-2 pr-3">{t ? seconds(t.transcribe) : "…"}</td>
      <td className="py-2 pr-3">{t ? seconds(t.perceive) : "…"}</td>
      <td className="py-2 pr-3">{t ? (pending ? "running…" : seconds(t.policy)) : "…"}</td>
      <td className="py-2 pr-3 font-semibold">{t ? seconds(Math.max(0, t.total - t.audio)) : "…"}</td>
    </tr>
  );
}
