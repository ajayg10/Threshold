"use client";

import { useEffect, useState, type FormEvent } from "react";
import { client } from "@/lib/api";
import type { ExpectedVisit, ResidentSettings, TrustedContact } from "@/lib/types";

const LANGUAGES = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिन्दी (Hindi)" },
];

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export default function SettingsPage() {
  const [settings, setSettings] = useState<ResidentSettings | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    client.settings().then(setSettings).catch((e: Error) => setError(e.message));
  }, []);

  if (!settings) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className={error ? "mt-4 font-semibold text-danger" : "mt-4"}>{error || "Loading…"}</p>
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
    try {
      setSettings(await client.saveSettings(settings!));
      setStatus("Saved.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <form onSubmit={save} className="mt-4 space-y-8">
        <fieldset className="space-y-3">
          <legend className="text-2xl font-bold">You</legend>
          <div>
            <label htmlFor="lang" className="block font-semibold">
              Your language
            </label>
            <select
              id="lang"
              className="field"
              value={settings.resident_language}
              onChange={(e) => update({ resident_language: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-base text-muted">Visitor cards are translated into this language.</p>
          </div>
          <div>
            <label htmlFor="retention" className="block font-semibold">
              Keep visit text for (days)
            </label>
            <input
              id="retention"
              type="number"
              min={1}
              max={90}
              className="field"
              value={settings.retention_days}
              onChange={(e) => update({ retention_days: Number(e.target.value) })}
            />
            <p className="mt-1 text-base text-muted">Audio is never kept. Text is deleted after this many days.</p>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-2xl font-bold">Trusted contacts</legend>
          {settings.trusted_contacts.map((c, i) => (
            <div key={c.id} className="card grid gap-2 p-3 sm:grid-cols-3">
              <TextField label="Name" value={c.name} onChange={(v) => setContact(i, { name: v })} />
              <TextField label="Relation" value={c.relation} onChange={(v) => setContact(i, { relation: v })} />
              <TextField label="Phone" value={c.phone ?? ""} onChange={(v) => setContact(i, { phone: v || null })} />
              <button
                type="button"
                className="btn sm:col-span-3"
                onClick={() => update({ trusted_contacts: settings.trusted_contacts.filter((_, j) => j !== i) })}
              >
                Remove {c.name || "contact"}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              update({
                trusted_contacts: [...settings.trusted_contacts, { id: newId("tc"), name: "", relation: "", phone: null }],
              })
            }
          >
            + Add contact
          </button>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-2xl font-bold">Expected visits</legend>
          {settings.expected_visits.map((v, i) => (
            <div key={v.id} className="card grid gap-2 p-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <TextField label="What" value={v.label} onChange={(x) => setVisit(i, { label: x })} />
              </div>
              <TextField label="From" type="time" value={v.window_start} onChange={(x) => setVisit(i, { window_start: x })} />
              <TextField label="To" type="time" value={v.window_end} onChange={(x) => setVisit(i, { window_end: x })} />
              <TextField
                label="Keywords"
                value={v.keywords.join(", ")}
                onChange={(x) => setVisit(i, { keywords: x.split(",").map((k) => k.trim()).filter(Boolean) })}
              />
              <button
                type="button"
                className="btn sm:col-span-3"
                onClick={() => update({ expected_visits: settings.expected_visits.filter((_, j) => j !== i) })}
              >
                Remove {v.label || "visit"}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              update({
                expected_visits: [
                  ...settings.expected_visits,
                  { id: newId("ev"), label: "", window_start: "09:00", window_end: "10:00", keywords: [] },
                ],
              })
            }
          >
            + Add expected visit
          </button>
        </fieldset>

        <section aria-labelledby="consent-heading" className="card bg-surface p-4">
          <h2 id="consent-heading" className="text-2xl font-bold">
            Visitor audio notice
          </h2>
          <p className="mt-2">{settings.consent_notice}</p>
          <p className="mt-2 text-base text-muted">
            Recording-consent laws vary by place. A real installation needs legal review and a visible notice at the door.
          </p>
        </section>

        <div className="flex items-center gap-4">
          <button type="submit" className="btn btn-primary">
            Save settings
          </button>
          <p role="status" aria-live="polite" className={error ? "font-semibold text-danger" : "text-ok"}>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  // The wrapping <label> names the input; no id needed.
  return (
    <label className="block">
      <span className="block font-semibold">{label}</span>
      <input type={type} className="field" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
