"use client";

import { useState } from "react";
import { client } from "@/lib/api";
import type { EscalationRecord, EventRecord, TrustedContact } from "@/lib/types";

const EMERGENCY_NUMBER = process.env.NEXT_PUBLIC_EMERGENCY_NUMBER ?? "112";

/** "Call family" (alerts a trusted contact) and, for emergencies, "Call emergency services". */
export default function HelpPanel({ record, contacts }: { record: EventRecord; contacts: TrustedContact[] }) {
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EscalationRecord | null>(null);
  const [error, setError] = useState("");
  const card = record.card;
  const contactId = chosen || contacts[0]?.id || "";

  async function alertFamily() {
    setBusy(true);
    setError("");
    try {
      setResult(await client.escalate(record.event.id, contactId || undefined));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const emergency = card?.visitor_type === "emergency";
  const prominent = emergency || card?.escalation.required;
  return (
    <section aria-labelledby="help-heading" className="mt-6 rounded-2xl border-2 border-line bg-surface p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-line/60 pb-3">
        <h2 id="help-heading" className="text-2xl font-bold tracking-tight">
          Assistance & Escalation
        </h2>
        <span className="text-xs text-muted">Never shares audio or full transcript</span>
      </div>

      {emergency && (
        <div className="mt-4 rounded-xl border-2 border-danger bg-danger-bg p-4 text-center">
          <p className="font-bold text-danger text-lg">⚠️ Emergency conditions detected</p>
          <a href={`tel:${EMERGENCY_NUMBER}`} className="btn btn-danger mt-3 w-full text-xl shadow-md">
            <span aria-hidden="true">📞</span> Call Emergency Services ({EMERGENCY_NUMBER})
          </a>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="contact" className="block text-sm font-semibold uppercase tracking-wider text-muted">
            Notify Trusted Contact
          </label>
          <select id="contact" className="field mt-1" value={contactId} onChange={(e) => setChosen(e.target.value)}>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.relation})
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={`btn ${prominent ? "btn-danger" : "btn-primary"} sm:w-44`}
          onClick={alertFamily}
          disabled={busy || !contacts.length}
        >
          <span aria-hidden="true">👪</span> {busy ? "Alerting…" : "Alert Family"}
        </button>
      </div>

      <div aria-live="polite" role="status">
        {result && (
          <div className="mt-3 rounded-lg border border-ok/40 bg-ok-bg p-3 text-sm font-semibold text-ok">
            ✓ {result.contact_name} was alerted{result.channel === "simulated" ? " (simulated: logged to console)" : " by SNS"}.
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-lg border border-danger/40 bg-danger-bg p-3 text-sm font-semibold text-danger">
            ⚠️ {error}
          </div>
        )}
      </div>

      {record.escalations.length > 0 && (
        <div className="mt-4 rounded-lg bg-surface-hover p-3 text-sm">
          <span className="font-semibold text-foreground">Alert History:</span>
          <ul className="mt-1 space-y-1 text-muted">
            {record.escalations.map((e) => (
              <li key={e.message_id}>
                • {e.by === "agent" ? "Threshold AI alerted" : "Resident alerted"} <strong>{e.contact_name}</strong> ·{" "}
                {e.channel === "simulated" ? "simulated" : "SNS"} · {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {emergency && <p className="mt-3 text-xs text-muted">Notice: Threshold is not a life-safety system.</p>}
    </section>
  );
}
