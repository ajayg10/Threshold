"use client";

import { useEffect, useState, type FormEvent } from "react";
import { client, setToken } from "@/lib/api";
import type { ExpectedVisit, ResidentSettings, TrustedContact } from "@/lib/types";

const LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "हिन्दी (Hindi)" },
];

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export default function SettingsPage() {
  const [settings, setSettings] = useState<ResidentSettings | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client.settings().then(setSettings).catch((e: Error) => setError(e.message));
  }, []);

  if (!settings) {
    return (
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className={error ? "mt-4 font-semibold text-danger" : "mt-4 text-muted"}>{error || "Loading settings…"}</p>
      </main>
    );
  }

  const update = (patch: Partial<ResidentSettings>) => setSettings({ ...settings, ...patch });
  const setContact = (i: number, patch: Partial<TrustedContact>) =>
    update({ trusted_contacts: settings.trusted_contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setVisit = (i: number, patch: Partial<ExpectedVisit>) =>
    update({ expected_visits: settings.expected_visits.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus("");
    setError("");
    setSaving(true);
    try {
      setSettings(await client.saveSettings(settings!));
      setStatus("Settings saved successfully.");
      setTimeout(() => setStatus(""), 4000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    if (confirm("Sign out and clear saved demo access code from this device?")) {
      setToken(null);
    }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resident Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Configure your preferred language, emergency escalation contacts, and scheduled deliveries.
          </p>
        </div>
      </div>

      <form onSubmit={save} className="mt-6 space-y-8">
        <fieldset className="card p-6 shadow-sm">
          <legend className="px-2 text-xl font-bold">👤 Profile & Privacy Preferences</legend>
          <div className="grid gap-4 mt-2 sm:grid-cols-2">
            <div>
              <label htmlFor="lang" className="block text-sm font-semibold uppercase tracking-wider text-muted">
                Your preferred language
              </label>
              <select
                id="lang"
                className="field mt-1"
                value={settings.resident_language}
                onChange={(e) => update({ resident_language: e.target.value })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">Visitor speech is translated into this language.</p>
            </div>
            <div>
              <label htmlFor="retention" className="block text-sm font-semibold uppercase tracking-wider text-muted">
                Keep visit history for (days)
              </label>
              <input
                id="retention"
                type="number"
                min={1}
                max={90}
                className="field mt-1"
                value={settings.retention_days}
                onChange={(e) => update({ retention_days: Number(e.target.value) })}
              />
              <p className="mt-1 text-xs text-muted">Audio is never kept. Text is automatically purged after this window.</p>
            </div>
          </div>
        </fieldset>

        <fieldset className="card p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <div>
              <legend className="text-xl font-bold">👪 Trusted Contacts</legend>
              <p className="text-sm text-muted">These contacts can be alerted in emergencies or when visitors raise high risk.</p>
            </div>
            <button
              type="button"
              className="btn text-sm"
              onClick={() =>
                update({
                  trusted_contacts: [...settings.trusted_contacts, { id: newId("tc"), name: "", relation: "", phone: null }],
                })
              }
            >
              + Add Contact
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {settings.trusted_contacts.map((c, i) => (
              <div key={c.id} className="rounded-xl border border-line bg-surface-hover/50 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField label="Contact Name" value={c.name} onChange={(v) => setContact(i, { name: v })} placeholder="e.g. Rahul" />
                  <TextField label="Relationship" value={c.relation} onChange={(v) => setContact(i, { relation: v })} placeholder="e.g. Son, Sister" />
                  <TextField label="Phone Number" value={c.phone ?? ""} onChange={(v) => setContact(i, { phone: v || null })} placeholder="e.g. +91 98765 43210" />
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="text-xs font-semibold text-danger hover:underline"
                    onClick={() => update({ trusted_contacts: settings.trusted_contacts.filter((_, j) => j !== i) })}
                  >
                    ✕ Remove {c.name || "contact"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="card p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <div>
              <legend className="text-xl font-bold">📅 Expected Visits & Appointments</legend>
              <p className="text-sm text-muted">The Bedrock Strands agent cross-verifies visitors against these booked windows.</p>
            </div>
            <button
              type="button"
              className="btn text-sm"
              onClick={() =>
                update({
                  expected_visits: [
                    ...settings.expected_visits,
                    { id: newId("ev"), label: "", window_start: "09:00", window_end: "10:00", keywords: [] },
                  ],
                })
              }
            >
              + Add Expected Visit
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {settings.expected_visits.map((v, i) => (
              <div key={v.id} className="rounded-xl border border-line bg-surface-hover/50 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <TextField label="Service / Visitor Description" value={v.label} onChange={(x) => setVisit(i, { label: x })} placeholder="e.g. AC Maintenance Technician" />
                  </div>
                  <TextField label="Start Time" type="time" value={v.window_start} onChange={(x) => setVisit(i, { window_start: x })} />
                  <TextField label="End Time" type="time" value={v.window_end} onChange={(x) => setVisit(i, { window_end: x })} />
                  <TextField
                    label="Matching Keywords"
                    value={v.keywords.join(", ")}
                    onChange={(x) => setVisit(i, { keywords: x.split(",").map((k) => k.trim()).filter(Boolean) })}
                    placeholder="e.g. ac, urban company, repair"
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="text-xs font-semibold text-danger hover:underline"
                    onClick={() => update({ expected_visits: settings.expected_visits.filter((_, j) => j !== i) })}
                  >
                    ✕ Remove {v.label || "scheduled visit"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <section aria-labelledby="consent-heading" className="card p-6 shadow-sm bg-surface">
          <h2 id="consent-heading" className="text-xl font-bold">
            🚪 Visitor Audio Notice & Consent
          </h2>
          <p className="mt-2 text-base leading-relaxed bg-surface-hover p-4 rounded-xl border border-line">
            “{settings.consent_notice}”
          </p>
          <p className="mt-2 text-xs text-muted">
            Displayed on the external Door Display tablet to fulfill legal notice requirements for transient audio transcription.
          </p>
        </section>

        <section aria-label="Device session" className="card p-6 shadow-sm border-line/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">🔐 Access Code & Session</h2>
              <p className="text-sm text-muted">Authorized on this browser via demo access code.</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="btn btn-danger text-sm self-start sm:self-auto"
            >
              Sign Out / Change Code
            </button>
          </div>
        </section>

        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 rounded-2xl border-2 border-line bg-surface/95 p-4 shadow-lg backdrop-blur-md">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "💾 Save Settings"}
          </button>
          <p role="status" aria-live="polite" className={`text-base font-semibold ${error ? "text-danger" : "text-ok"}`}>
            {error || status}
          </p>
        </div>
      </form>
    </main>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold uppercase tracking-wider text-muted">{label}</span>
      <input
        type={type}
        className="field mt-1 text-base"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
