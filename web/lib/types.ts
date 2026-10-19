// Mirrors backend/app/models.py. There is deliberately no unlock/open action anywhere.

export type Level = "low" | "medium" | "high";
export type VisitorType =
  | "delivery"
  | "service"
  | "known_contact"
  | "solicitor"
  | "unknown"
  | "emergency"
  | "no_speech";
export type RiskFlag =
  | "pretext_entry_request"
  | "unverified_authority_claim"
  | "urgency_pressure"
  | "payment_request"
  | "asks_for_codes_or_otp"
  | "tailgating_attempt"
  | "prompt_injection_attempt";
export type ReplyIntent =
  | "accept_delivery"
  | "decline"
  | "ask_id"
  | "ask_to_wait"
  | "ask_to_repeat"
  | "call_family"
  | "emergency_help";

export type SuggestedReply = { id: string; resident_text: string; visitor_text: string; intent: ReplyIntent };

export type VisitorCard = {
  event_id: string;
  detected_language: string;
  transcript: string;
  translation: string;
  visitor_type: VisitorType;
  urgency: Level;
  risk_level: Level;
  risk_flags: RiskFlag[];
  summary: string;
  suggested_replies: SuggestedReply[];
  escalation: { required: boolean; reason: string };
  matched_expected_visit: { id: string; label: string } | null;
  timings_ms: { audio: number; transcribe: number; perceive: number; policy: number; total: number };
};

export type PipelineInfo = {
  audio_source: "seeded" | "ring_clip" | "none";
  transcript_source: "transcribe_streaming" | "transcribe_batch" | "precomputed" | "none";
  perception_model: string | null;
  perception_fallback: boolean;
  policy: "pending" | "agent" | "fast_path" | "agent_failed";
  policy_model: string | null;
  notes: string[];
};

export type ReplyRecord = {
  id: string;
  source: "suggested" | "custom";
  suggestion_id: string | null;
  resident_text: string;
  visitor_text: string;
  visitor_language: string;
  created_at: string;
};

export type EscalationRecord = {
  at: string;
  by: "agent" | "resident";
  contact_id: string;
  contact_name: string;
  channel: "sns" | "simulated";
  message_id: string;
  reason: string;
};

export type EventRecord = {
  event: {
    id: string;
    device_id: string;
    type: "ding" | "motion";
    ts: string;
    source: "ring_api" | "test_harness" | "seeded";
    media: { audio_url: string | null; snapshot_url: string | null };
  };
  device_name: string | null;
  status: "processing" | "ready" | "error";
  card: VisitorCard | null;
  pipeline: PipelineInfo | null;
  replies: ReplyRecord[];
  escalations: EscalationRecord[];
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type TrustedContact = { id: string; name: string; relation: string; phone: string | null };
export type ExpectedVisit = { id: string; label: string; window_start: string; window_end: string; keywords: string[] };

export type ResidentSettings = {
  resident_name: string;
  resident_language: string;
  timezone: string;
  trusted_contacts: TrustedContact[];
  expected_visits: ExpectedVisit[];
  retention_days: number;
  consent_notice: string;
};

export type Health = {
  status: string;
  version: string;
  env: string;
  region: string;
  store: string;
  ring_api_configured: boolean;
  precomputed_transcripts: boolean;
};

export type Scenario = { id: string; label: string; event_type: "ding" | "motion"; language: string | null; seeded: boolean };

export type ReplyResponse = {
  reply: ReplyRecord;
  audio_url: string | null;
  plays_on: "door_display";
  timings_ms: { translate: number; tts: number };
  warnings: string[];
};

export type DoorFeed = {
  latest_event: {
    id: string;
    created_at: string;
    status: string;
    visitor_language: string | null;
    has_reply: boolean;
  } | null;
  reply: {
    event_id: string;
    id: string;
    visitor_text: string;
    visitor_language: string;
    created_at: string;
    audio_url: string | null;
  } | null;
};

export type RingStatus =
  | { configured: false; source: string; devices: string[] }
  | { configured: true; mode: string; linked: boolean; devices?: string[]; error?: string; latency_ms?: number };
