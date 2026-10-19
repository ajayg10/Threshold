// Plain-language labels. Risk is always shown as colour + icon + text, never colour alone.

import type { EventRecord, Level, ReplyIntent, RiskFlag, VisitorType } from "./types";

export const VISITOR_TYPE: Record<VisitorType, { label: string; icon: string }> = {
  delivery: { label: "Delivery", icon: "📦" },
  service: { label: "Service visit", icon: "🔧" },
  known_contact: { label: "Someone you know", icon: "👋" },
  solicitor: { label: "Salesperson", icon: "🗂️" },
  unknown: { label: "Unknown visitor", icon: "❔" },
  emergency: { label: "Emergency reported", icon: "🔥" },
  no_speech: { label: "No one spoke", icon: "🔇" },
};

export const RISK: Record<Level, { label: string; icon: string; tone: "ok" | "warn" | "danger" }> = {
  low: { label: "Low risk", icon: "✓", tone: "ok" },
  medium: { label: "Be careful", icon: "⚠", tone: "warn" },
  high: { label: "High risk: do not open the door", icon: "⛔", tone: "danger" },
};

export const FLAG: Record<RiskFlag, string> = {
  pretext_entry_request: "Asked to come inside",
  unverified_authority_claim: "Claims an authority we cannot verify",
  urgency_pressure: "Pressure to act right now",
  payment_request: "Asked for money",
  asks_for_codes_or_otp: "Asked for a code or OTP",
  tailgating_attempt: "Tried to follow someone in",
  prompt_injection_attempt: "Tried to manipulate Threshold",
};

export const INTENT: Record<ReplyIntent, string> = {
  accept_delivery: "Parcel",
  decline: "Decline",
  ask_id: "Ask for ID",
  ask_to_wait: "Ask to wait",
  ask_to_repeat: "Ask to repeat",
  call_family: "Family",
  emergency_help: "Emergency",
};

const LANGUAGES: Record<string, string> = { hi: "Hindi", en: "English" };

export function languageName(code: string | null | undefined): string {
  if (!code || code === "und") return "Unknown language";
  return LANGUAGES[code.split("-")[0].toLowerCase()] ?? code;
}

export function sameLanguage(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.split("-")[0].toLowerCase() === b.split("-")[0].toLowerCase();
}

/** Badges that disclose what is seeded, simulated or cached (docs/SEEDED_DATA.md). */
export function provenanceBadges(record: EventRecord): string[] {
  const badges: string[] = [];
  if (record.event.source === "test_harness") badges.push("Test harness");
  if (record.event.source === "ring_api") badges.push("Ring");
  if (record.pipeline?.audio_source === "seeded") badges.push("Seeded audio");
  if (record.pipeline?.transcript_source === "precomputed") badges.push("Cached transcript");
  if (record.escalations.some((e) => e.channel === "simulated")) badges.push("Simulated alert");
  return badges;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}
