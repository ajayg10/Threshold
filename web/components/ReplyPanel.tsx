"use client";

import { useRef, useState, type FormEvent } from "react";
import { client } from "@/lib/api";
import { INTENT, languageName } from "@/lib/labels";
import type { ReplyResponse, VisitorCard } from "@/lib/types";

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
    <section aria-labelledby="reply-heading" className="mt-6">
      <h2 id="reply-heading" className="text-2xl font-bold">
        Reply
      </h2>
      <p className="text-muted">Shown and spoken on the Door Display in {languageName(card.detected_language)}.</p>
      <div className="mt-3 grid gap-3">
        {card.suggested_replies.map((r) => (
          <button
            key={r.id}
            type="button"
            className="btn flex-col items-start"
            disabled={sending !== null}
            onClick={() => send(r.id, { reply_id: r.id })}
            aria-describedby={`${r.id}-visitor`}
          >
            <span className="text-sm uppercase tracking-wide text-muted">{INTENT[r.intent]}</span>
            <span className="text-xl">{sending === r.id ? "Sending…" : r.resident_text}</span>
            {r.visitor_text !== r.resident_text && (
              <span id={`${r.id}-visitor`} lang={card.detected_language} className="text-base font-normal text-muted">
                {r.visitor_text}
              </span>
            )}
          </button>
        ))}
      </div>

      <form onSubmit={submitCustom} className="mt-4">
        <label htmlFor="custom-reply" className="block font-semibold">
          Or type your own reply
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            id="custom-reply"
            className="field"
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Please leave it with the guard"
          />
          <button type="submit" className="btn btn-primary" disabled={sending !== null || !text.trim()}>
            {sending === "custom" ? "Translating…" : "Send"}
          </button>
        </div>
      </form>

      <div aria-live="polite" role="status" className="mt-4">
        {sent && (
          <div className="card bg-surface p-4">
            <p className="font-semibold">Playing to visitor on the Door Display…</p>
            <p lang={sent.reply.visitor_language} className="mt-2 text-2xl">
              {sent.reply.visitor_text}
            </p>
            {sent.reply.visitor_text !== sent.reply.resident_text && (
              <p className="mt-1 text-muted">You said: {sent.reply.resident_text}</p>
            )}
            {sent.warnings.map((w) => (
              <p key={w} className="mt-2 font-semibold text-danger">
                ⚠ {w}
              </p>
            ))}
            <button type="button" className="btn mt-3" onClick={playHere} disabled={!sent.audio_url}>
              ▶ Replay on this device
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="font-semibold text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
