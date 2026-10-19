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
    <section aria-labelledby="help-heading" className="mt-6">
      <h2 id="help-heading" className="text-2xl font-bold">
        Get help
      </h2>
      {emergency && (
        <a href={`tel:${EMERGENCY_NUMBER}`} className="btn btn-danger mt-3 w-full text-xl">
          <span aria-hidden="true">📞</span> Call emergency services ({EMERGENCY_NUMBER})
        </a>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="contact" className="block font-semibold">
            Trusted contact
          </label>
          <select id="contact" className="field" value={contactId} onChange={(e) => setChosen(e.target.value)}>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.relation})
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={`btn ${prominent ? "btn-primary" : ""}`}
          onClick={alertFamily}
          disabled={busy || !contacts.length}
        >
          <span aria-hidden="true">👪</span> {busy ? "Alerting…" : "Call family"}
        </button>
      </div>
      <div aria-live="polite" role="status">
        {result && (
          <p className="mt-2 font-semibold text-ok">
            ✓ {result.contact_name} was alerted{result.channel === "simulated" ? " (simulated: nothing was sent)" : " by SNS"}.
          </p>
        )}
        {error && <p className="mt-2 font-semibold text-danger">{error}</p>}
      </div>
      {record.escalations.length > 0 && (
        <ul className="mt-3 space-y-1 text-muted">
          {record.escalations.map((e) => (
            <li key={e.message_id}>
              {e.by === "agent" ? "Threshold alerted" : "You alerted"} {e.contact_name} ·{" "}
              {e.channel === "simulated" ? "simulated" : "SNS"} · {e.reason}
            </li>
          ))}
        </ul>
      )}
      {emergency && <p className="mt-2 text-base text-muted">Threshold is not a life-safety system.</p>}
    </section>
  );
}
