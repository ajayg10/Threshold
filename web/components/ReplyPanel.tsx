"use client";

import { useRef, useState, type FormEvent } from "react";
import { client } from "@/lib/api";
import { INTENT, languageName } from "@/lib/labels";
import type { ReplyResponse, VisitorCard } from "@/lib/types";

const INTENT_ICONS: Record<string, string> = {
  instruction: "📦",
  delay: "⏳",
  no_entry: "🚫",
  emergency: "🚨",
  who_is_it: "❓",
};

/** Suggested replies + custom reply. Replies show and play on the Door Display tablet
 * (Ring has no API to speak through the doorbell). "Play here" plays it on this device too. */
export default function ReplyPanel({ eventId, card }: { eventId: string; card: VisitorCard }) {
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<ReplyResponse | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  async function send(key: string, body: { reply_id: string } | { text: string }) {
    setSending(key);
    setError("");
    try {
      const res = await client.reply(eventId, body);
      setSent(res);
      if ("text" in body) setText("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(null);
    }
  }

  function playHere() {
    if (!sent?.audio_url) return;
    audio.current?.pause();
    audio.current = new Audio(sent.audio_url);
    audio.current.play().catch(() => setError("This device blocked audio playback."));
  }

  function submitCustom(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) send("custom", { text: text.trim() });
  }

  return (
    <section aria-labelledby="reply-heading" className="mt-8 rounded-2xl border-2 border-line bg-surface p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div>
          <h2 id="reply-heading" className="text-2xl font-bold tracking-tight">
            Send Reply to Visitor
          </h2>
          <p className="text-sm text-muted">
            Spoken in {languageName(card.detected_language)} on the external Door Display tablet.
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">
          Neural TTS & Screen
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {card.suggested_replies.map((r) => {
          const icon = INTENT_ICONS[r.intent] || "💬";
          return (
            <button
              key={r.id}
              type="button"
              className="btn flex flex-col items-start p-4 hover:border-accent text-left transition-all"
              disabled={sending !== null}
              onClick={() => send(r.id, { reply_id: r.id })}
              aria-describedby={`${r.id}-visitor`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                  <span>{icon}</span> {INTENT[r.intent] || r.intent}
                </span>
                {sending === r.id && (
                  <span className="text-xs font-semibold text-accent pulse-dot">Broadcasting…</span>
                )}
              </div>
              <span className="mt-1 text-xl font-bold leading-snug">{r.resident_text}</span>
              {r.visitor_text !== r.resident_text && (
                <span id={`${r.id}-visitor`} lang={card.detected_language} className="mt-1 text-sm text-muted italic">
                  Visitor hears: “{r.visitor_text}”
                </span>
              )}
            </button>
          );
        })}
      </div>

      <form onSubmit={submitCustom} className="mt-6 border-t border-line/50 pt-4">
        <label htmlFor="custom-reply" className="block text-sm font-semibold uppercase tracking-wider text-muted">
          Or Type Custom Reply (Auto-Translated)
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="custom-reply"
            className="field text-base"
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Please leave the package with the building guard"
          />
          <button type="submit" className="btn btn-primary sm:w-32" disabled={sending !== null || !text.trim()}>
            {sending === "custom" ? "Translating…" : "Send Reply"}
          </button>
        </div>
      </form>

      <div aria-live="polite" role="status" className="mt-4">
        {sent && (
          <div className="rounded-xl border-2 border-ok/50 bg-ok-bg p-5 text-foreground shadow-sm">
            <div className="flex items-center gap-2 text-ok font-bold text-lg">
              <span>✓</span> Broadcast to Door Display tablet
            </div>
            <p lang={sent.reply.visitor_language} className="mt-2 text-2xl font-bold text-foreground">
              “{sent.reply.visitor_text}”
            </p>
            {sent.reply.visitor_text !== sent.reply.resident_text && (
              <p className="mt-1 text-sm text-muted">You said: {sent.reply.resident_text}</p>
            )}
            {sent.warnings.map((w) => (
              <p key={w} className="mt-2 font-semibold text-danger">
                ⚠ {w}
              </p>
            ))}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn text-sm bg-surface" onClick={playHere} disabled={!sent.audio_url}>
                ▶ Hear Polly audio preview on this device
              </button>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger-bg p-3 font-semibold text-danger">
            ⚠️ {error}
          </div>
        )}
      </div>
    </section>
  );
}
