"use client";

import { useEffect, useState, type FormEvent } from "react";
import { client, setToken } from "@/lib/api";
import type { ExpectedVisit, ResidentSettings, TrustedContact } from "@/lib/types";
import {
  Sliders,
  Users,
  Calendar,
  Shield,
  Sun,
  Moon,
  Clock,
  LogOut,
  Check,
  Plus,
  Trash2,
} from "lucide-react";

const LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "हिन्दी (Hindi)" },
];

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

type SettingsTab = "preferences" | "contacts" | "visits" | "notice" | "session";

export default function SettingsPage() {
  const [settings, setSettings] = useState<ResidentSettings | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("preferences");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [themeMode, setThemeMode] = useState<"auto" | "day" | "night">("auto");

  useEffect(() => {
    client.settings().then(setSettings).catch((e: Error) => setError(e.message));

    // Read initial theme preference
    try {
      const stored = localStorage.getItem("threshold.theme");
      if (stored === "day" || stored === "night") {
        setThemeMode(stored);
      } else {
        setThemeMode("auto");
      }
    } catch {
      // storage unavailable
    }
  }, []);

  const handleThemeChange = (mode: "auto" | "day" | "night") => {
    setThemeMode(mode);
    try {
      if (mode === "auto") {
        localStorage.removeItem("threshold.theme");
        const hour = new Date().getHours();
        const autoTheme = hour < 7 || hour >= 19 ? "night" : "day";
        document.documentElement.setAttribute("data-theme", autoTheme);
      } else {
        localStorage.setItem("threshold.theme", mode);
        document.documentElement.setAttribute("data-theme", mode);
      }
    } catch {
      // ignore
    }
  };

  if (!settings) {
    return (
      <div className="mx-auto w-full max-w-2xl py-12 text-center text-[var(--dusk)]">
        <h1 className="font-display text-2xl font-black">Resident settings</h1>
        <p className="mt-2 text-sm text-[var(--frame-text)]">{error || "Loading settings..."}</p>
      </div>
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

  const tabs: { id: SettingsTab; label: string; icon: typeof Sliders; count?: number }[] = [
    { id: "preferences", label: "Preferences", icon: Sliders },
    { id: "contacts", label: "Trusted contacts", icon: Users, count: settings.trusted_contacts.length },
    { id: "visits", label: "Expected visits", icon: Calendar, count: settings.expected_visits.length },
    { id: "notice", label: "Consent notice", icon: Shield },
    { id: "session", label: "Session", icon: LogOut },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl text-[var(--dusk)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--frame)]/30 pb-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-black tracking-tight">
            Resident settings
          </h1>
          <p className="mt-1 text-sm text-[var(--frame-text)]">
            Spoken language, trusted contacts, calendar verification, and theme.
          </p>
        </div>
        {status && (
          <span role="status" className="inline-flex items-center gap-1 rounded-full bg-[var(--safe-bg)] px-3 py-1 text-xs font-bold text-[var(--safe)]">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            {status}
          </span>
        )}
      </div>

      {/* Tabs */}
      <nav aria-label="Settings sections" className="mt-6 flex flex-wrap gap-2 border-b border-[var(--frame)]/30 pb-3">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-[12px] px-3.5 py-2 text-xs font-bold transition-colors ${
                active
                  ? "bg-[var(--dusk)] text-white"
                  : "border border-[var(--frame)]/40 bg-[var(--surface)] text-[var(--frame-text)] hover:text-[var(--dusk)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20 text-white" : "bg-[var(--frame)]/15 text-[var(--frame-text)]"}`}>
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
          <div className="space-y-6 rounded-[20px] border border-[var(--frame)]/40 bg-[var(--surface)] p-6">
            <h2 className="text-lg font-bold font-display">Appearance & language</h2>

            {/* Theme Toggle */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--frame-text)]">
                Color theme
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleThemeChange("day")}
                  className={`flex items-center justify-center gap-2 rounded-[14px] border-2 p-3 text-sm font-bold transition-colors ${
                    themeMode === "day"
                      ? "border-[var(--dusk)] bg-[var(--dusk)] text-white"
                      : "border-[var(--frame)]/40 bg-[var(--surface)] text-[var(--dusk)] hover:border-[var(--dusk)]"
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  <span>Day</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange("night")}
                  className={`flex items-center justify-center gap-2 rounded-[14px] border-2 p-3 text-sm font-bold transition-colors ${
                    themeMode === "night"
                      ? "border-[var(--dusk)] bg-[var(--dusk)] text-white"
                      : "border-[var(--frame)]/40 bg-[var(--surface)] text-[var(--dusk)] hover:border-[var(--dusk)]"
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  <span>Night</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange("auto")}
                  className={`flex items-center justify-center gap-2 rounded-[14px] border-2 p-3 text-sm font-bold transition-colors ${
                    themeMode === "auto"
                      ? "border-[var(--dusk)] bg-[var(--dusk)] text-white"
                      : "border-[var(--frame)]/40 bg-[var(--surface)] text-[var(--dusk)] hover:border-[var(--dusk)]"
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  <span>Auto (Time)</span>
                </button>
              </div>
              <p className="text-xs text-[var(--frame-text)]">
                Auto switches to Night theme from 7:00 PM to 7:00 AM based on your local time.
              </p>
            </div>

            {/* Resident Language */}
            <div className="space-y-2 border-t border-[var(--frame)]/25 pt-4">
              <label htmlFor="lang-select" className="block text-xs font-bold uppercase tracking-wider text-[var(--frame-text)]">
                Resident language
              </label>
              <select
                id="lang-select"
                value={settings.resident_language}
                onChange={(e) => update({ resident_language: e.target.value })}
                className="w-full rounded-[14px] border-2 border-[var(--frame)]/40 bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--dusk)] focus:border-[var(--dusk)]"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--frame-text)]">
                Visitor speech will be translated into this language inside your home.
              </p>
            </div>

            {/* Retention */}
            <div className="space-y-2 border-t border-[var(--frame)]/25 pt-4">
              <label htmlFor="retention-input" className="block text-xs font-bold uppercase tracking-wider text-[var(--frame-text)]">
                History retention
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="retention-input"
                  type="number"
                  min={1}
                  max={90}
                  value={settings.retention_days}
                  onChange={(e) => update({ retention_days: Number(e.target.value) })}
                  className="w-24 rounded-[14px] border-2 border-[var(--frame)]/40 bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--dusk)] focus:border-[var(--dusk)]"
                />
                <span className="text-xs text-[var(--frame-text)]">days (1–90). Transcripts are purged after this window.</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Trusted Contacts */}
        {activeTab === "contacts" && (
          <div className="space-y-4 rounded-[20px] border border-[var(--frame)]/40 bg-[var(--surface)] p-6">
            <div className="flex items-center justify-between border-b border-[var(--frame)]/25 pb-3">
              <div>
                <h2 className="text-lg font-bold font-display">Trusted contacts</h2>
                <p className="text-xs text-[var(--frame-text)]">Alerted when high-risk visitors or emergencies are detected.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  update({
                    trusted_contacts: [...settings.trusted_contacts, { id: newId("tc"), name: "", relation: "", phone: null }],
                  })
                }
                className="inline-flex items-center gap-1 rounded-[12px] bg-[var(--dusk)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add contact</span>
              </button>
            </div>

            {settings.trusted_contacts.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--frame-text)]">No trusted contacts added yet.</p>
            ) : (
              <div className="space-y-3">
                {settings.trusted_contacts.map((c, i) => (
                  <div key={c.id} className="rounded-[16px] border border-[var(--frame)]/30 p-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--frame)]/20">
                      <span className="text-sm font-bold">{c.name || "New contact"}</span>
                      <button
                        type="button"
                        onClick={() => update({ trusted_contacts: settings.trusted_contacts.filter((_, j) => j !== i) })}
                        className="inline-flex items-center gap-1 text-xs text-[var(--alarm)] hover:underline"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
                      <label className="block">
                        <span className="font-semibold text-[var(--frame-text)]">Name</span>
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => setContact(i, { name: e.target.value })}
                          placeholder="e.g. Rahul"
                          className="mt-1 w-full rounded-[10px] border border-[var(--frame)]/40 p-2 text-sm text-[var(--dusk)]"
                        />
                      </label>
                      <label className="block">
                        <span className="font-semibold text-[var(--frame-text)]">Relation</span>
                        <input
                          type="text"
                          value={c.relation}
                          onChange={(e) => setContact(i, { relation: e.target.value })}
                          placeholder="e.g. Son"
                          className="mt-1 w-full rounded-[10px] border border-[var(--frame)]/40 p-2 text-sm text-[var(--dusk)]"
                        />
                      </label>
                      <label className="block">
                        <span className="font-semibold text-[var(--frame-text)]">Phone number</span>
                        <input
                          type="text"
                          value={c.phone || ""}
                          onChange={(e) => setContact(i, { phone: e.target.value || null })}
                          placeholder="e.g. +91 98765 43210"
                          className="mt-1 w-full rounded-[10px] border border-[var(--frame)]/40 p-2 text-sm text-[var(--dusk)]"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Expected Visits */}
        {activeTab === "visits" && (
          <div className="space-y-4 rounded-[20px] border border-[var(--frame)]/40 bg-[var(--surface)] p-6">
            <div className="flex items-center justify-between border-b border-[var(--frame)]/25 pb-3">
              <div>
                <h2 className="text-lg font-bold font-display">Expected visits</h2>
                <p className="text-xs text-[var(--frame-text)]">Verified by the safety policy to match appointments.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  update({
                    expected_visits: [
                      ...settings.expected_visits,
                      { id: newId("ev"), label: "", window_start: "16:00", window_end: "17:00", keywords: [] },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 rounded-[12px] bg-[var(--dusk)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add appointment</span>
              </button>
            </div>

            {settings.expected_visits.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--frame-text)]">No expected visits configured.</p>
            ) : (
              <div className="space-y-3">
                {settings.expected_visits.map((v, i) => (
                  <div key={v.id} className="rounded-[16px] border border-[var(--frame)]/30 p-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--frame)]/20">
                      <span className="text-sm font-bold">{v.label || "New appointment"}</span>
                      <button
                        type="button"
                        onClick={() => update({ expected_visits: settings.expected_visits.filter((_, j) => j !== i) })}
                        className="inline-flex items-center gap-1 text-xs text-[var(--alarm)] hover:underline"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
                      <label className="block sm:col-span-3">
                        <span className="font-semibold text-[var(--frame-text)]">Service description</span>
                        <input
                          type="text"
                          value={v.label}
                          onChange={(e) => setVisit(i, { label: e.target.value })}
                          placeholder="e.g. CoolAir AC Service"
                          className="mt-1 w-full rounded-[10px] border border-[var(--frame)]/40 p-2 text-sm text-[var(--dusk)]"
                        />
                      </label>
                      <label className="block">
                        <span className="font-semibold text-[var(--frame-text)]">Window start</span>
                        <input
                          type="text"
                          value={v.window_start}
                          onChange={(e) => setVisit(i, { window_start: e.target.value })}
                          className="mt-1 w-full rounded-[10px] border border-[var(--frame)]/40 p-2 text-sm text-[var(--dusk)]"
                        />
                      </label>
                      <label className="block">
                        <span className="font-semibold text-[var(--frame-text)]">Window end</span>
                        <input
                          type="text"
                          value={v.window_end}
                          onChange={(e) => setVisit(i, { window_end: e.target.value })}
                          className="mt-1 w-full rounded-[10px] border border-[var(--frame)]/40 p-2 text-sm text-[var(--dusk)]"
                        />
                      </label>
                      <label className="block">
                        <span className="font-semibold text-[var(--frame-text)]">Keywords (comma-separated)</span>
                        <input
                          type="text"
                          value={v.keywords.join(", ")}
                          onChange={(e) => setVisit(i, { keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
                          placeholder="e.g. ac, coolair, service"
                          className="mt-1 w-full rounded-[10px] border border-[var(--frame)]/40 p-2 text-sm text-[var(--dusk)]"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Consent notice */}
        {activeTab === "notice" && (
          <div className="space-y-4 rounded-[20px] border border-[var(--frame)]/40 bg-[var(--surface)] p-6">
            <h2 className="text-lg font-bold font-display">Visitor consent notice</h2>
            <div className="rounded-[14px] border border-[var(--frame)]/30 bg-[var(--frost)] p-4 text-sm leading-relaxed">
              “{settings.consent_notice}”
            </div>
            <p className="text-xs text-[var(--frame-text)]">
              This notice appears on the door tablet outside. Audio is processed transiently and discarded immediately after transcription.
            </p>
          </div>
        )}

        {/* Tab 5: Session */}
        {activeTab === "session" && (
          <div className="space-y-4 rounded-[20px] border border-[var(--frame)]/40 bg-[var(--surface)] p-6">
            <h2 className="text-lg font-bold font-display">Device session</h2>
            <p className="text-sm text-[var(--frame-text)]">
              Authorized via demo access code.
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex min-h-[3rem] items-center gap-2 rounded-[14px] border-2 border-[var(--alarm)] bg-[var(--alarm-bg)] px-5 py-2.5 text-sm font-bold text-[var(--alarm)] hover:opacity-90"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out of this browser</span>
            </button>
          </div>
        )}

        {/* Save button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--dusk)] px-6 py-3 font-bold text-white hover:opacity-95 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            <span>{saving ? "Saving..." : "Save settings"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
