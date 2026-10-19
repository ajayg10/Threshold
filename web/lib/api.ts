// API client. "/api" in production (same CloudFront domain); http://localhost:8000/api in local dev
// (web/.env.development). The demo access token is DEMO_TOKEN: demo auth, not production auth.

import type {
  DoorFeed,
  EscalationRecord,
  EventRecord,
  Health,
  ReplyResponse,
  ResidentSettings,
  RingStatus,
  Scenario,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";
const TOKEN_KEY = "threshold.token";
export const AUTH_EVENT = "threshold:auth";

export class AuthError extends Error {}
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// localStorage can be unavailable (private mode, blocked storage), so every access is guarded.
export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the gate will ask again */
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

/** Imports a token from the URL fragment (#token=...), which browsers never send to servers. */
export function importTokenFromHash(): void {
  const match = window.location.hash.match(/(?:^#|&)token=([^&]+)/);
  if (!match) return;
  setToken(decodeURIComponent(match[1]));
  history.replaceState(null, "", window.location.pathname + window.location.search);
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
  health: (signal?: AbortSignal) => api<Health>("/health", { signal }),
  checkAuth: () => api<{ ok: boolean }>("/auth/check"),
  events: (since?: string, signal?: AbortSignal) =>
    api<EventRecord[]>(`/events${since ? `?since=${encodeURIComponent(since)}` : ""}`, { signal }),
  event: (id: string, signal?: AbortSignal) => api<EventRecord>(`/events/${encodeURIComponent(id)}`, { signal }),
  reply: (id: string, body: { reply_id: string } | { text: string }) =>
    post<ReplyResponse>(`/events/${encodeURIComponent(id)}/reply`, body),
  escalate: (id: string, contactId?: string) =>
    post<EscalationRecord>(`/events/${encodeURIComponent(id)}/escalate`, { contact_id: contactId ?? null }),
  settings: () => api<ResidentSettings>("/settings"),
  saveSettings: (s: ResidentSettings) => api<ResidentSettings>("/settings", { method: "PUT", body: JSON.stringify(s) }),
  scenarios: () => api<Scenario[]>("/demo/scenarios"),
  trigger: (scenarioId: string) =>
    post<{ result: { status: string; event_id: string | null }; ingest_ms: number }>("/demo/trigger", {
      scenario_id: scenarioId,
    }),
  reset: () => post<{ ok: boolean }>("/demo/reset"),
  door: (signal?: AbortSignal) => api<DoorFeed>("/door", { signal }),
  ringStatus: () => api<RingStatus>("/ring/status"),
};
