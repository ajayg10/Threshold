// API client. "/api" in production (same CloudFront domain); http://localhost:8000/api in local dev.
// Supports NEXT_PUBLIC_MOCK=1 for zero-network testing and fixture playback.

import type {
  DoorEvent,
  DoorFeed,
  EscalationRecord,
  EventRecord,
  Health,
  ReplyRecord,
  ReplyResponse,
  ResidentSettings,
  RingStatus,
  Scenario,
} from "./types";
import { FIXTURE_EVENTS, FIXTURE_SCENARIOS } from "./fixtures";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";
const TOKEN_KEY = "threshold.token";
const MOCK_KEY = "threshold.mock";
export const AUTH_EVENT = "threshold:auth";

export class AuthError extends Error {}
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function isMockMode(): boolean {
  if (process.env.NEXT_PUBLIC_MOCK === "1") return true;
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(MOCK_KEY);
      if (stored === "1") return true;
      if (window.location.search.includes("mock=1")) return true;
    } catch {
      // storage unavailable
    }
  }
  return false;
}

export function setMockMode(enabled: boolean): void {
  if (typeof window !== "undefined") {
    try {
      if (enabled) window.localStorage.setItem(MOCK_KEY, "1");
      else window.localStorage.removeItem(MOCK_KEY);
    } catch {
      // ignore
    }
  }
}

export const DEFAULT_DEMO_TOKEN =
  process.env.NEXT_PUBLIC_DEMO_TOKEN ?? "QVAuyvSgltwYMPKY42RyiMQ--IkDSpWJ";

export function getToken(): string | null {
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
    return stored || DEFAULT_DEMO_TOKEN;
  } catch {
    return DEFAULT_DEMO_TOKEN;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.setItem(TOKEN_KEY, DEFAULT_DEMO_TOKEN);
  } catch {
    /* storage unavailable */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
}

export function importTokenFromHash(): void {
  if (typeof window === "undefined") return;
  const match = window.location.hash.match(/(?:^#|&)token=([^&]+)/);
  if (!match) return;
  setToken(decodeURIComponent(match[1]));
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

// In-memory Mock State
let mockCurrentEvent: DoorEvent = { ...FIXTURE_EVENTS.s1_delivery_hi, ts: new Date().toISOString() };
let mockEventsList: DoorEvent[] = Object.values(FIXTURE_EVENTS);
let mockActiveReply: DoorFeed["reply"] = null;
let mockSettings: ResidentSettings = {
  resident_name: "Asha",
  resident_language: "en-IN",
  timezone: "Asia/Kolkata",
  trusted_contacts: [
    { id: "tc_rahul", name: "Rahul", relation: "Son", phone: "+91 98765 43210" },
    { id: "tc_priya", name: "Priya", relation: "Neighbour", phone: "+91 98765 43211" },
  ],
  expected_visits: [
    {
      id: "ev_ac_service",
      label: "CoolAir AC Service (4:00 PM)",
      window_start: new Date(Date.now() - 3600000).toISOString(),
      window_end: new Date(Date.now() + 7200000).toISOString(),
      keywords: ["ac", "coolair", "service", "technician"],
    },
  ],
  retention_days: 7,
  consent_notice: "Audio and video at this threshold are monitored for resident safety and translated live.",
};

function doorEventToRecord(de: DoorEvent): EventRecord {
  return {
    event: {
      id: de.id,
      device_id: "front_door_cam",
      type: de.card?.visitor_type === "no_speech" ? "motion" : "ding",
      ts: de.ts,
      source: de.source === "ring_simulator" ? "test_harness" : (de.source as "ring_api" | "test_harness" | "seeded"),
      media: { audio_url: null, snapshot_url: null },
    },
    device_name: "Front Door",
    status: de.status,
    stage: de.stage,
    card: de.card ?? null,
    pipeline: de.pipeline ?? null,
    replies: de.replies ?? [],
    escalations: de.escalations ?? [],
    error: de.error ?? null,
    created_at: de.ts,
    updated_at: de.ts,
  } as EventRecord & { stage?: string };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) {
    setToken(null);
    throw new AuthError("Access code missing or wrong");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : res.statusText;
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const client = {
  health: async (signal?: AbortSignal): Promise<Health> => {
    if (isMockMode()) {
      return {
        status: "ok",
        version: "0.1.0-mock",
        env: "mock",
        region: "local",
        store: "in-memory",
        ring_api_configured: true,
        precomputed_transcripts: true,
      };
    }
    return api<Health>("/health", { signal });
  },

  checkAuth: async (): Promise<{ ok: boolean }> => {
    if (isMockMode()) return { ok: true };
    return api<{ ok: boolean }>("/auth/check");
  },

  events: async (since?: string, signal?: AbortSignal): Promise<EventRecord[]> => {
    if (isMockMode()) {
      return [doorEventToRecord(mockCurrentEvent), ...mockEventsList.filter((e) => e.id !== mockCurrentEvent.id).map(doorEventToRecord)];
    }
    return api<EventRecord[]>(`/events${since ? `?since=${encodeURIComponent(since)}` : ""}`, { signal });
  },

  event: async (id: string, signal?: AbortSignal): Promise<EventRecord> => {
    if (isMockMode()) {
      if (mockCurrentEvent.id === id) return doorEventToRecord(mockCurrentEvent);
      const found = mockEventsList.find((e) => e.id === id);
      if (found) return doorEventToRecord(found);
      return doorEventToRecord(mockCurrentEvent);
    }
    return api<EventRecord>(`/events/${encodeURIComponent(id)}`, { signal });
  },

  reply: async (id: string, body: { reply_id: string } | { text: string }): Promise<ReplyResponse> => {
    if (isMockMode()) {
      let residentText = "Sent reply";
      let visitorText = "Sent reply";
      let suggestionId: string | null = null;
      let source: "suggested" | "custom" = "custom";

      if ("reply_id" in body) {
        source = "suggested";
        suggestionId = body.reply_id;
        const matched = mockCurrentEvent.card?.suggested_replies.find((r) => r.id === body.reply_id);
        if (matched) {
          residentText = matched.resident_text;
          visitorText = matched.visitor_text;
        }
      } else {
        source = "custom";
        residentText = body.text;
        visitorText = body.text;
      }

      const rec: ReplyRecord = {
        id: `rep_${Date.now()}`,
        source,
        suggestion_id: suggestionId,
        resident_text: residentText,
        visitor_text: visitorText,
        visitor_language: mockCurrentEvent.card?.detected_language || "hi-IN",
        created_at: new Date().toISOString(),
      };
      if (!mockCurrentEvent.replies) mockCurrentEvent.replies = [];
      mockCurrentEvent.replies.push(rec);

      mockActiveReply = {
        event_id: id,
        id: rec.id,
        visitor_text: rec.visitor_text,
        visitor_language: rec.visitor_language,
        created_at: rec.created_at,
        audio_url: null,
      };

      return {
        reply: rec,
        audio_url: null,
        plays_on: "door_display",
        timings_ms: { translate: 120, tts: 250 },
        warnings: [],
      };
    }
    return post<ReplyResponse>(`/events/${encodeURIComponent(id)}/reply`, body);
  },

  escalate: async (id: string, contactId?: string): Promise<EscalationRecord> => {
    if (isMockMode()) {
      const esc: EscalationRecord = {
        at: new Date().toISOString(),
        by: "resident",
        contact_id: contactId || "tc_rahul",
        contact_name: "Rahul",
        channel: "simulated",
        message_id: `msg_${Date.now()}`,
        reason: "Resident requested escalation from visitor card.",
      };
      if (!mockCurrentEvent.escalations) mockCurrentEvent.escalations = [];
      mockCurrentEvent.escalations.push(esc);
      return esc;
    }
    return post<EscalationRecord>(`/events/${encodeURIComponent(id)}/escalate`, { contact_id: contactId ?? null });
  },

  settings: async (): Promise<ResidentSettings> => {
    if (isMockMode()) return mockSettings;
    return api<ResidentSettings>("/settings");
  },

  saveSettings: async (s: ResidentSettings): Promise<ResidentSettings> => {
    if (isMockMode()) {
      mockSettings = s;
      return s;
    }
    return api<ResidentSettings>("/settings", { method: "PUT", body: JSON.stringify(s) });
  },

  scenarios: async (): Promise<Scenario[]> => {
    if (isMockMode()) return FIXTURE_SCENARIOS;
    return api<Scenario[]>("/demo/scenarios");
  },

  trigger: async (scenarioId: string): Promise<{ result: { status: string; event_id: string | null }; ingest_ms: number }> => {
    if (isMockMode()) {
      const fixture = FIXTURE_EVENTS[scenarioId] || FIXTURE_EVENTS.s1_delivery_hi;
      const newId = `evt_${Date.now()}`;

      // Set initial processing state: "heard"
      mockCurrentEvent = {
        ...fixture,
        id: newId,
        ts: new Date().toISOString(),
        status: "processing",
        stage: "heard",
        replies: [],
        escalations: [],
        card: {
          ...fixture.card!,
          event_id: newId,
        },
      };

      // Progress through stages asynchronously
      setTimeout(() => {
        if (mockCurrentEvent.id === newId && mockCurrentEvent.status === "processing") {
          mockCurrentEvent.stage = "translating";
        }
      }, 550);

      setTimeout(() => {
        if (mockCurrentEvent.id === newId && mockCurrentEvent.status === "processing") {
          mockCurrentEvent.stage = "checking";
        }
      }, 1100);

      setTimeout(() => {
        if (mockCurrentEvent.id === newId && mockCurrentEvent.status === "processing") {
          mockCurrentEvent.status = "ready";
          mockCurrentEvent.stage = undefined;
        }
      }, 1650);

      return {
        result: { status: "queued", event_id: newId },
        ingest_ms: 18,
      };
    }
    return post<{ result: { status: string; event_id: string | null }; ingest_ms: number }>("/demo/trigger", {
      scenario_id: scenarioId,
    });
  },

  reset: async (): Promise<{ ok: boolean }> => {
    if (isMockMode()) {
      mockCurrentEvent = { ...FIXTURE_EVENTS.s1_delivery_hi, ts: new Date().toISOString() };
      mockActiveReply = null;
      return { ok: true };
    }
    return post<{ ok: boolean }>("/demo/reset");
  },

  door: async (signal?: AbortSignal): Promise<DoorFeed> => {
    if (isMockMode()) {
      return {
        latest_event: {
          id: mockCurrentEvent.id,
          created_at: mockCurrentEvent.ts,
          status: mockCurrentEvent.status,
          visitor_language: mockCurrentEvent.card?.detected_language || "hi-IN",
          has_reply: !!mockActiveReply,
        },
        reply: mockActiveReply,
      };
    }
    return api<DoorFeed>("/door", { signal });
  },

  ringStatus: async (): Promise<RingStatus> => {
    if (isMockMode()) {
      return { configured: true, mode: "mock", linked: true, devices: ["Front Door Cam"] };
    }
    return api<RingStatus>("/ring/status");
  },
};
