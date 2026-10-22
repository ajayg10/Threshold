import { describe, expect, it } from "vitest";
import { doorMode, REPLY_WINDOW_MS, WAIT_WINDOW_MS } from "./door";
import { latestUpdate, mergeEvents } from "./hooks";
import { FLAG, INTENT, RISK, VISITOR_TYPE, languageName, provenanceBadges, sameLanguage, seconds, timeAgo } from "./labels";
import type { DoorFeed, EventRecord } from "./types";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function record(id: string, created: string, updated = created, extra: Partial<EventRecord> = {}): EventRecord {
  return {
    event: { id, device_id: "d", type: "ding", ts: created, source: "test_harness", media: { audio_url: null, snapshot_url: null } },
    device_name: null, status: "ready", card: null, pipeline: null, replies: [], escalations: [], error: null,
    created_at: created, updated_at: updated, ...extra,
  };
}

describe("risk is never colour alone", () => {
  it("every level has an icon and words", () => {
    for (const r of Object.values(RISK)) {
      expect(r.icon.length).toBeGreaterThan(0);
      expect(r.label.length).toBeGreaterThan(3);
    }
    expect(RISK.high.label).toMatch(/do not open/i);
  });
  it("every risk flag has a plain-language label", () => {
    expect(Object.keys(FLAG)).toHaveLength(7);
    expect(FLAG.prompt_injection_attempt).not.toMatch(/injection/i);
  });
});

describe("languages", () => {
  it("names and compares by base language", () => {
    expect(languageName("hi-IN")).toBe("Hindi");
    expect(languageName("und")).toBe("Unknown language");
    expect(sameLanguage("en-IN", "en-US")).toBe(true);
    expect(sameLanguage("hi-IN", "en-IN")).toBe(false);
  });
});

describe("provenance badges disclose seeded and simulated data", () => {
  it("labels the test harness, seeded audio, cached transcripts and simulated alerts", () => {
    const r = record("e", ago(0), ago(0), {
      pipeline: { audio_source: "seeded", transcript_source: "precomputed", perception_model: null,
        perception_fallback: false, policy: "fast_path", policy_model: null, notes: [] },
      escalations: [{ at: ago(0), by: "agent", contact_id: "c", contact_name: "Rahul", channel: "simulated", message_id: "m", reason: "" }],
    });
    expect(provenanceBadges(r)).toEqual(["Test harness", "Seeded audio", "Cached transcript", "Simulated alert"]);
  });
});

describe("event feed merging", () => {
  it("merges by id, newest first, and tracks the latest update", () => {
    const a = record("a", ago(3000), ago(3000));
    const b = record("b", ago(2000), ago(2000));
    const a2 = { ...a, status: "ready" as const, updated_at: ago(500) };
    const merged = mergeEvents([a, b], [a2]);
    expect(merged.map((e) => e.event.id)).toEqual(["b", "a"]);
    expect(merged[1].updated_at).toBe(ago(500));
    expect(latestUpdate([a, a2, b], undefined)).toBe(ago(500));
    expect(latestUpdate([], ago(100))).toBe(ago(100));
  });
});

describe("door display", () => {
  const reply = (eventId: string, created: string) => ({
    event_id: eventId, id: "rep", visitor_text: "कृपया रुकिए", visitor_language: "hi-IN", created_at: created, audio_url: null,
  });
  const feed = (latest: DoorFeed["latest_event"], r: DoorFeed["reply"]): DoorFeed => ({ latest_event: latest, reply: r });
  const latest = (created: string, hasReply: boolean) =>
    ({ id: "e1", created_at: created, status: "ready", visitor_language: "hi-IN", has_reply: hasReply });

  it("idles with no visits", () => expect(doorMode(feed(null, null), NOW).kind).toBe("idle"));
  it("asks a fresh visitor to wait, in their language first", () =>
    expect(doorMode(feed(latest(ago(10_000), false), null), NOW)).toEqual({ kind: "wait", lang: "hi-IN" }));
  it("shows the reply to the newest visit", () =>
    expect(doorMode(feed(latest(ago(10_000), true), reply("e1", ago(5000))), NOW).kind).toBe("reply"));
  it("never shows a reply meant for an older visitor", () =>
    expect(doorMode(feed({ ...latest(ago(1000), false), id: "e2" }, reply("e1", ago(5000))), NOW).kind).toBe("wait"));
  it("goes idle after the windows pass", () => {
    expect(doorMode(feed(latest(ago(WAIT_WINDOW_MS + 1), false), null), NOW).kind).toBe("idle");
    expect(doorMode(feed(latest(ago(REPLY_WINDOW_MS * 2), true), reply("e1", ago(REPLY_WINDOW_MS + 1))), NOW).kind).toBe("idle");
  });
});

describe("timeAgo", () => {
  it("is human readable", () => {
    expect(timeAgo(ago(2000), NOW)).toBe("just now");
    expect(timeAgo(ago(35_000), NOW)).toBe("35 s ago");
    expect(timeAgo(ago(90_000), NOW)).toBe("2 min ago");
    expect(timeAgo(ago(7200_000), NOW)).toBe("2 h ago");
  });
});

describe("visitor types and reply intents", () => {
  it("every visitor type has an icon and descriptive label", () => {
    expect(Object.keys(VISITOR_TYPE).length).toBe(7);
    expect(VISITOR_TYPE.delivery.label).toBe("Delivery");
    expect(VISITOR_TYPE.emergency.label).toBe("Emergency reported");
    expect(VISITOR_TYPE.service.icon).toBe("🔧");
  });

  it("every reply intent has a concise label", () => {
    expect(Object.keys(INTENT).length).toBe(7);
    expect(INTENT.accept_delivery).toBe("Parcel");
    expect(INTENT.emergency_help).toBe("Emergency");
    expect(INTENT.ask_id).toBe("Ask for ID");
  });
});

describe("seconds formatting", () => {
  it("formats milliseconds to one decimal place in seconds", () => {
    expect(seconds(1200)).toBe("1.2 s");
    expect(seconds(500)).toBe("0.5 s");
    expect(seconds(0)).toBe("0.0 s");
  });
});

describe("provenanceBadges with ring_api", () => {
  it("labels ring source correctly", () => {
    const r = record("e-ring", ago(100), ago(100), {
      event: { id: "e-ring", device_id: "d", type: "ding", ts: ago(100), source: "ring_api", media: { audio_url: null, snapshot_url: null } },
    });
    expect(provenanceBadges(r)).toEqual(["Ring"]);
  });
});
