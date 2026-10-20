"use client";

import { useEffect, useState, type FormEvent } from "react";
import { client, setToken } from "@/lib/api";
import type { ExpectedVisit, ResidentSettings, TrustedContact } from "@/lib/types";

const LANGUAGES = [
  { code: "en-IN", label: "English (India)", flag: "🇮🇳" },
  { code: "hi-IN", label: "हिन्दी (Hindi)", flag: "🇮🇳" },
];

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

type SettingsTab = "preferences" | "contacts" | "visits" | "notice" | "session";

export default function SettingsPage() {
  const [settings, setSettings] = useState<ResidentSettings | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("preferences");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client.settings().then(setSettings).catch((e: Error) => setError(e.message));
  }, []);

  if (!settings) {
    return (
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8" suppressHydrationWarning>
        <h1 className="text-3xl font-extrabold tracking-tight">Resident Settings</h1>
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

  const tabs: { id: SettingsTab; label: string; icon: string; count?: number }[] = [
    { id: "preferences", label: "Preferences", icon: "⚙️" },
    { id: "contacts", label: "Trusted Contacts", icon: "👪", count: settings.trusted_contacts.length },
    { id: "visits", label: "Expected Visits", icon: "📅", count: settings.expected_visits.length },
    { id: "notice", label: "Visitor Notice", icon: "🚪" },
    { id: "session", label: "Session", icon: "🔐" },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6" suppressHydrationWarning>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Resident Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Configure your spoken language, emergency contacts, calendar verification, and data retention.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs font-bold text-ok bg-ok-bg px-3 py-1 rounded-full border border-ok/30">
              <span>✓</span> {status}
            </span>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <nav aria-label="Settings sections" className="mt-6 flex flex-wrap gap-2 border-b border-line pb-3">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
                active
                  ? "bg-accent text-accent-fg shadow-sm"
                  : "bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-line"
              }`}
            >
              <span aria-hidden="true">{tab.icon}</span>
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span className={`text-xs px-1.5 py-0.2 rounded-full font-bold ${
                  active ? "bg-accent-fg/20 text-accent-fg" : "bg-muted/15 text-muted"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <form onSubmit={save} className="mt-6 space-y-6">
        {/* Tab 1: Preferences */}
        {activeTab === "preferences" && (
          <fieldset className="card p-6 shadow-sm space-y-6">
            <div className="border-b border-line/60 pb-3">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span>👤</span> Language & Privacy Preferences
              </h2>
              <p className="text-sm text-muted mt-0.5">Control how Threshold translates visitor speech and purges your transcripts.</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="lang" className="block text-sm font-bold uppercase tracking-wider text-muted">
                  Your Primary Language
                </label>
                <select
                  id="lang"
                  className="field text-base font-medium"
                  value={settings.resident_language}
                  onChange={(e) => update({ resident_language: e.target.value })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted">Visitor speech in Hindi or English will be translated to this language on your screen.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="retention" className="block text-sm font-bold uppercase tracking-wider text-muted">
                  History Retention Window (Days)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="retention"
                    type="number"
                    min={1}
                    max={90}
                    className="field text-base font-bold sm:w-32"
                    value={settings.retention_days}
                    onChange={(e) => update({ retention_days: Number(e.target.value) })}
                  />
                  <span className="text-sm text-muted">days (1–90)</span>
                </div>
                <p className="text-xs text-muted">Visitor audio is never stored. Summaries and text are automatically purged after this period.</p>
              </div>
            </div>
          </fieldset>
        )}

        {/* Tab 2: Trusted Contacts */}
        {activeTab === "contacts" && (
          <fieldset className="card p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line/60 pb-3">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span>👪</span> Trusted Family & Emergency Contacts
                </h2>
                <p className="text-sm text-muted">Can be alerted immediately if a high-risk visitor or emergency is detected.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary text-sm self-start sm:self-auto"
                onClick={() =>
                  update({
                    trusted_contacts: [...settings.trusted_contacts, { id: newId("tc"), name: "", relation: "", phone: null }],
                  })
                }
              >
                + Add Contact
              </button>
            </div>

            {settings.trusted_contacts.length === 0 ? (
              <div className="py-8 text-center text-muted">
                <p className="text-base">No trusted contacts configured yet.</p>
                <p className="text-xs mt-1">Add a family member or neighbor so Threshold can alert them during emergencies.</p>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {settings.trusted_contacts.map((c, i) => (
                  <div key={c.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm hover:border-accent/40 transition-colors">
                    <div className="flex items-center justify-between pb-3 border-b border-line/50">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent font-bold text-sm">
                          {c.name ? c.name.charAt(0).toUpperCase() : "#" + (i + 1)}
                        </span>
                        <div>
                          <p className="font-bold text-base">{c.name || "Unnamed Contact"}</p>
                          <p className="text-xs text-muted font-medium">{c.relation || "Relationship not specified"}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger hover:underline px-2 py-1"
                        onClick={() => update({ trusted_contacts: settings.trusted_contacts.filter((_, j) => j !== i) })}
                      >
                        ✕ Remove
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <TextField label="Full Name" value={c.name} onChange={(v) => setContact(i, { name: v })} placeholder="e.g. Priya Sharma" />
                      <TextField label="Relation" value={c.relation} onChange={(v) => setContact(i, { relation: v })} placeholder="e.g. Sister, Neighbor" />
                      <TextField label="Phone Number" value={c.phone ?? ""} onChange={(v) => setContact(i, { phone: v || null })} placeholder="e.g. +91 98765 43210" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {/* Tab 3: Expected Visits */}
        {activeTab === "visits" && (
          <fieldset className="card p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line/60 pb-3">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span>📅</span> Scheduled Visits & Appointments
                </h2>
                <p className="text-sm text-muted">The Bedrock Strands policy agent cross-checks visitor claims against these booked windows.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary text-sm self-start sm:self-auto"
                onClick={() =>
                  update({
                    expected_visits: [
                      ...settings.expected_visits,
                      { id: newId("ev"), label: "", window_start: "09:00", window_end: "10:00", keywords: [] },
                    ],
                  })
                }
              >
                + Add Appointment
              </button>
            </div>

            {settings.expected_visits.length === 0 ? (
              <div className="py-8 text-center text-muted">
                <p className="text-base">No expected visits configured.</p>
                <p className="text-xs mt-1">Add appointments like AC repair, courier, or plumber so Threshold can verify technician claims.</p>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {settings.expected_visits.map((v, i) => (
                  <div key={v.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm hover:border-accent/40 transition-colors">
                    <div className="flex items-center justify-between pb-3 border-b border-line/50">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🔧</span>
                        <span className="font-bold text-base">{v.label || "Scheduled Appointment"}</span>
                        <span className="text-xs rounded-full bg-surface-hover px-2 py-0.5 border border-line font-mono">
                          {v.window_start} – {v.window_end}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger hover:underline px-2 py-1"
                        onClick={() => update({ expected_visits: settings.expected_visits.filter((_, j) => j !== i) })}
                      >
                        ✕ Remove
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-3">
                        <TextField label="Service Description" value={v.label} onChange={(x) => setVisit(i, { label: x })} placeholder="e.g. AC Maintenance Technician (Urban Company)" />
                      </div>
                      <TextField label="Window Start Time" type="time" value={v.window_start} onChange={(x) => setVisit(i, { window_start: x })} />
                      <TextField label="Window End Time" type="time" value={v.window_end} onChange={(x) => setVisit(i, { window_end: x })} />
                      <TextField
                        label="Matching Keywords (Comma-separated)"
                        value={v.keywords.join(", ")}
                        onChange={(x) => setVisit(i, { keywords: x.split(",").map((k) => k.trim()).filter(Boolean) })}
                        placeholder="e.g. ac, urban company, repair"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {/* Tab 4: Visitor Notice */}
        {activeTab === "notice" && (
          <section aria-labelledby="consent-heading" className="card p-6 shadow-sm space-y-4">
            <div className="border-b border-line/60 pb-3">
              <h2 id="consent-heading" className="text-xl font-bold flex items-center gap-2">
                <span>🚪</span> External Visitor Audio Notice
              </h2>
              <p className="text-sm text-muted mt-0.5">Displayed prominently on the Door Display tablet outside your door.</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface-hover/70 p-5">
              <span className="text-xs font-bold uppercase tracking-widest text-muted">Notice Text</span>
              <p className="mt-2 text-lg font-medium leading-relaxed">
                “{settings.consent_notice}”
              </p>
            </div>
            <p className="text-xs text-muted">
              Legal notice: Recording and biometric consent regulations require clear disclosure at entry points. Audio is processed transiently and discarded immediately after transcription.
            </p>
          </section>
        )}

        {/* Tab 5: Session */}
        {activeTab === "session" && (
          <section aria-label="Device session" className="card p-6 shadow-sm space-y-4">
            <div className="border-b border-line/60 pb-3">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span>🔐</span> Access Code & Device Authentication
              </h2>
              <p className="text-sm text-muted mt-0.5">Manage your active authentication session on this device.</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-line bg-surface">
              <div>
                <p className="font-bold text-base">Active Demo Authorization</p>
                <p className="text-xs text-muted">This browser is authorized using the shared DEMO_TOKEN configured in your environment.</p>
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
        )}

        {/* Sticky Action Footer */}
        <div className="sticky bottom-4 z-30 flex items-center justify-between gap-4 rounded-2xl border-2 border-line bg-surface/95 p-4 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving Changes…" : "💾 Save Settings"}
            </button>
            {status && (
              <span role="status" aria-live="polite" className="text-sm font-semibold text-ok hidden sm:inline">
                ✓ {status}
              </span>
            )}
          </div>
          {error && (
            <span role="alert" className="text-sm font-semibold text-danger">
              ⚠️ {error}
            </span>
          )}
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
    <label className="block space-y-1">
      <span className="block text-xs font-bold uppercase tracking-wider text-muted">{label}</span>
      <input
        type={type}
        className="field text-sm font-medium"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
