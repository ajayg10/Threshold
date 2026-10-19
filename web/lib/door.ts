import type { DoorFeed } from "./types";

export const WAIT_WINDOW_MS = 5 * 60 * 1000;
export const REPLY_WINDOW_MS = 10 * 60 * 1000;

export type DoorMode =
  | { kind: "idle" }
  | { kind: "wait"; lang: string | null }
  | { kind: "reply"; reply: NonNullable<DoorFeed["reply"]> };

/** What the Door Display shows: the reply to the newest visit, a "please wait" while the resident
 * reads a fresh visit, or an idle prompt. Old visits never leave a stale message on the door. */
export function doorMode(feed: DoorFeed | null, now: number): DoorMode {
  const latest = feed?.latest_event;
  const reply = feed?.reply;
  if (reply && latest && reply.event_id === latest.id && now - Date.parse(reply.created_at) < REPLY_WINDOW_MS) {
    return { kind: "reply", reply };
  }
  if (latest && !latest.has_reply && now - Date.parse(latest.created_at) < WAIT_WINDOW_MS) {
    return { kind: "wait", lang: latest.visitor_language };
  }
  return { kind: "idle" };
}
