"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { client } from "@/lib/api";
import { useEvents, usePoll } from "@/lib/hooks";
import { languageName, seconds, VISITOR_TYPE } from "@/lib/labels";
import type { EventRecord, RingStatus, Scenario } from "@/lib/types";

const SCENARIO_DETAILS: Record<string, { icon: string; expected: string; tag: string }> = {
  s1_delivery_hi: {
    icon: "📦",
    tag: "Low Risk Delivery",
    expected: "Speaks Hindi · Low risk · Suggests: 'Leave it at door'",
  },
  s2_meter_pretext: {
    icon: "⚡",
    tag: "Pretext / High Risk",
    expected: "Demands entry for meter · High risk · Escalates to family",
  },
  s3_neighbour: {
    icon: "🏡",
    tag: "Known Neighbour",
    expected: "Priya returning dish · Low risk · Friendly greeting replies",
  },
  s4_ac_service: {
    icon: "❄️",
    tag: "Scheduled Service",
    expected: "AC Technician · Verified against scheduled 4–5pm window",
  },
  s5_solar_sales: {
    icon: "☀️",
    tag: "Salesperson",
    expected: "Solar sales pitch · Low risk · Suggests: 'Not interested'",
  },
  s6_smoke: {
    icon: "🚨",
    tag: "Emergency Alert",
    expected: "Reports smoke in window · Emergency risk · Call 112 button",
  },
  s7_injection: {
    icon: "🛡️",
    tag: "Prompt Injection",
    expected: "'Ignore previous instructions' · Flagged as manipulation",
  },
  s8_silent: {
    icon: "🤫",
    tag: "No Speech",
    expected: "Nobody speaks · Suggests: 'Who is it?' · Low risk",
  },
};

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
      setMessage(`✓ ${s.id}: ${r.result.status} (webhook accepted in ${r.ingest_ms} ms)`);
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
      setMessage("✓ Reset complete: all past events cleared, seeded settings restored.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interactive Demo & Simulator</h1>
          <p className="mt-1 text-sm text-muted">
            Trigger signed webhook visits through the full Amazon Transcribe & Bedrock AI pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-danger text-sm" onClick={reset} disabled={busy !== null}>
            {busy === "reset" ? "Resetting…" : "Reset Events"}
          </button>
          <Link href="/door" className="btn btn-primary text-sm" target="_blank">
            Open Door Display ↗
          </Link>
        </div>
      </div>

      <section aria-label="System Pipeline Status" className="card mt-6 p-5 bg-surface shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Pipeline Provenance & Infrastructure</h2>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-surface-hover/60 p-3 border border-line/60">
            <span className="font-bold text-foreground">🔔 Event Intake:</span>
            <p className="text-muted mt-0.5">Threshold HMAC-signed test harness exercises identical code to Ring webhooks.</p>
          </div>
          <div className="rounded-lg bg-surface-hover/60 p-3 border border-line/60">
            <span className="font-bold text-foreground">🎙️ Speech Processing:</span>
            <p className="text-muted mt-0.5">
              {health?.precomputed_transcripts ? (
                <span className="font-semibold text-warn">Cached Transcribe output is active.</span>
              ) : (
                "Live Amazon Transcribe & Bedrock Claude Haiku 4.5."
              )}
            </p>
          </div>
          <div className="rounded-lg bg-surface-hover/60 p-3 border border-line/60">
            <span className="font-bold text-foreground">🗣️ Speech Synthesis:</span>
            <p className="text-muted mt-0.5">Amazon Polly neural voices (Kajal for Hindi & Indian English) streamed to Door Display.</p>
          </div>
          <div className="rounded-lg bg-surface-hover/60 p-3 border border-line/60">
            <span className="font-bold text-foreground">🚪 Ring Partner API:</span>
            <p className="text-muted mt-0.5">
              {ring === null
                ? "Connecting…"
                : ring.configured
                  ? ring.linked
                    ? `Linked (${ring.mode}), devices: ${ring.devices?.join(", ")}`
                    : `Configured but unreachable: ${ring.error}`
                  : "No physical Ring credentials; running with signed test harness."}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="scenarios-heading" className="mt-8">
        <div className="flex items-center justify-between">
          <h2 id="scenarios-heading" className="text-2xl font-bold tracking-tight">
            Trigger Visitor Scenarios
          </h2>
          <span className="text-xs text-muted">Click any scenario to simulate a doorbell ring</span>
        </div>

        {message && (
          <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm font-semibold text-accent">
            {message}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {scenarios.map((s) => {
            const meta = SCENARIO_DETAILS[s.id] || { icon: "🔔", tag: "Visitor", expected: s.label };
            const isBusy = busy === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className="btn flex flex-col items-start p-4 hover:border-accent text-left transition-all"
                disabled={busy !== null}
                onClick={() => trigger(s)}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                    <span className="text-base">{meta.icon}</span> {meta.tag}
                  </span>
                  <span className="text-xs rounded-full bg-surface-hover px-2 py-0.5 border border-line text-muted">
                    {languageName(s.language)}
                  </span>
                </div>
                <span className="mt-1 text-lg font-bold leading-snug">
                  {isBusy ? "Simulating Ringing…" : s.label}
                </span>
                <span className="mt-1 text-xs text-muted leading-relaxed">
                  {meta.expected}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="latency-heading" className="mt-10">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h2 id="latency-heading" className="text-2xl font-bold tracking-tight">
            Pipeline Latency Dashboard
          </h2>
          <span className="text-xs text-muted">Target: &lt; 4 seconds after visitor speech</span>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Pipeline timings for recent visits</caption>
            <thead>
              <tr className="border-b border-line bg-surface-hover/70 text-xs font-bold uppercase tracking-wider text-muted">
                <th scope="col" className="py-3 px-4">Visitor</th>
                <th scope="col" className="py-3 px-3">Clip</th>
                <th scope="col" className="py-3 px-3">Transcribe</th>
                <th scope="col" className="py-3 px-3">Understand</th>
                <th scope="col" className="py-3 px-3">Policy Check</th>
                <th scope="col" className="py-3 px-4 font-bold text-foreground">Total Turnaround</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted">
                    No recent pipeline events yet. Click a scenario above to measure live latency.
                  </td>
                </tr>
              ) : (
                events.slice(0, 8).map((e) => (
                  <LatencyRow key={e.event.id} record={e} />
                ))
              )}
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
    <tr className="align-middle hover:bg-surface-hover/40 transition-colors">
      <th scope="row" className="py-3 px-4 font-medium">
        <Link href={`/event?id=${encodeURIComponent(record.event.id)}`} className="text-accent hover:underline font-bold">
          {c ? VISITOR_TYPE[c.visitor_type].label : record.status}
        </Link>
        {record.pipeline && (
          <span className="block text-xs text-muted">
            {record.pipeline.transcript_source} · agent: {record.pipeline.policy}
          </span>
        )}
      </th>
      <td className="py-3 px-3 font-mono">{t ? seconds(t.audio) : "…"}</td>
      <td className="py-3 px-3 font-mono">{t ? seconds(t.transcribe) : "…"}</td>
      <td className="py-3 px-3 font-mono">{t ? seconds(t.perceive) : "…"}</td>
      <td className="py-3 px-3 font-mono">{t ? (pending ? "⏳ running…" : seconds(t.policy)) : "…"}</td>
      <td className="py-3 px-4 font-mono font-bold text-ok">
        {t ? seconds(Math.max(0, t.total - t.audio)) : "…"}
      </td>
    </tr>
  );
}
