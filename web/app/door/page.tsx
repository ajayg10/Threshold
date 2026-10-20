"use client";

import { useEffect, useRef, useState } from "react";
import { client } from "@/lib/api";
import { doorMode } from "@/lib/door";
import { usePoll } from "@/lib/hooks";

/** Door Display: a tablet by the door or window that shows and speaks the resident's replies in the
 * visitor's language. Ring has no API to speak through the doorbell, so this screen does it instead. */

const COPY = {
  en: {
    idle: "Please ring the bell. The reply will appear here.",
    wait: "Please wait. The resident is reading your message.",
    replay: "Hear Reply Again",
  },
  hi: {
    idle: "कृपया घंटी बजाइए। जवाब यहाँ दिखेगा।",
    wait: "कृपया रुकिए। निवासी आपका संदेश पढ़ रहे हैं।",
    replay: "फिर से सुनें",
  },
} as const;

function Bilingual({ text, first }: { text: { en: string; hi: string }; first: string | null }) {
  const order: ("en" | "hi")[] = first?.startsWith("hi") ? ["hi", "en"] : ["en", "hi"];
  return (
    <div className="space-y-6">
      <p lang={order[0]} className="text-5xl font-black leading-tight tracking-tight sm:text-7xl">
        {text[order[0]]}
      </p>
      <p lang={order[1]} className="text-3xl font-medium text-muted sm:text-5xl">
        {text[order[1]]}
      </p>
    </div>
  );
}

export default function DoorDisplayPage() {
  const { data: feed, error } = usePoll((signal) => client.door(signal), 1000);
  const [soundOn, setSoundOn] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const played = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const mode = doorMode(feed, now);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  function play(url: string | null) {
    if (!url) return;
    audio.current?.pause();
    audio.current = new Audio(url);
    setIsPlaying(true);
    audio.current.onended = () => setIsPlaying(false);
    audio.current.onerror = () => setIsPlaying(false);
    audio.current.play().catch(() => {
      setSoundOn(false);
      setIsPlaying(false);
    });
  }

  // Speak each new reply once (the URL is re-signed on every poll, so key on the reply id).
  useEffect(() => {
    if (mode.kind !== "reply" || !soundOn) return;
    if (played.current === mode.reply.id) return;
    played.current = mode.reply.id;
    play(mode.reply.audio_url);
  }, [mode, soundOn]);

  function enableSound() {
    // A user gesture unlocks audio playback for this page (browser autoplay policy).
    const unlock = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
    unlock.play().catch(() => undefined);
    if (mode.kind === "reply") played.current = mode.reply.id; // don't replay an old reply on unlock
    setSoundOn(true);
  }

  return (
    <main id="main" className="flex min-h-screen flex-col justify-between bg-background p-8 sm:p-16 selection:bg-accent selection:text-accent-fg">
      {/* Top Header / Mode Indicator */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line/60 pb-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-md text-xl" aria-hidden="true">
            🚪
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Threshold Door Display</h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Smart Intercom Screen</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {mode.kind === "reply" ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-ok bg-ok-bg px-4 py-1.5 text-sm font-bold text-ok shadow-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-ok pulse-dot" aria-hidden="true" />
              Resident Replied
            </span>
          ) : mode.kind === "wait" ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-warn bg-warn-bg px-4 py-1.5 text-sm font-bold text-warn shadow-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-warn pulse-dot" aria-hidden="true" />
              Resident Reading Message
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-muted">
              <span className="h-2.5 w-2.5 rounded-full bg-muted" aria-hidden="true" />
              Ready & Listening
            </span>
          )}
        </div>
      </header>

      {/* Main Center Message Area */}
      <div aria-live="polite" className="my-auto flex flex-1 flex-col justify-center py-12">
        {mode.kind === "reply" ? (
          <div className="space-y-8">
            <div className="rounded-3xl border-3 border-accent/40 bg-surface p-8 sm:p-14 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-accent mb-4">Message from Resident</p>
              <p lang={mode.reply.visitor_language} className="text-5xl font-black leading-tight sm:text-7xl">
                “{mode.reply.visitor_text}”
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="btn btn-primary text-2xl py-4 px-8 min-h-[4rem] shadow-md"
                onClick={() => play(mode.reply.audio_url)}
                disabled={!mode.reply.audio_url}
              >
                <span>{isPlaying ? "🔊 Speaking…" : "▶"}</span>
                <span>{COPY[mode.reply.visitor_language.startsWith("hi") ? "hi" : "en"].replay}</span>
              </button>

              {isPlaying && (
                <div className="flex items-end gap-1.5 h-8 px-4 py-1 rounded-2xl bg-surface border border-accent/30 shadow-sm" aria-label="Audio playback active">
                  <span className="w-1.5 bg-accent rounded-full wave-bar-1" />
                  <span className="w-1.5 bg-accent rounded-full wave-bar-2" />
                  <span className="w-1.5 bg-accent rounded-full wave-bar-3" />
                  <span className="w-1.5 bg-accent rounded-full wave-bar-4" />
                  <span className="w-1.5 bg-accent rounded-full wave-bar-2" />
                  <span className="w-1.5 bg-accent rounded-full wave-bar-1" />
                  <span className="text-xs font-bold text-accent ml-2 uppercase tracking-wider">Polly Neural Speech</span>
                </div>
              )}
            </div>
          </div>
        ) : mode.kind === "wait" ? (
          <div className="rounded-3xl border-2 border-line bg-surface p-8 sm:p-14 shadow-sm">
            <Bilingual text={{ en: COPY.en.wait, hi: COPY.hi.wait }} first={mode.lang} />
          </div>
        ) : (
          <div className="rounded-3xl border border-line bg-surface p-8 sm:p-14 shadow-sm">
            <Bilingual text={{ en: COPY.en.idle, hi: COPY.hi.idle }} first={null} />
          </div>
        )}
      </div>

      {/* Footer Controls & Sound Toggle */}
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-6 border-t border-line/60 pt-6 text-sm text-muted">
        <p className="max-w-md">
          External door display tablet · Shows and speaks resident responses · Not the Ring doorbell
        </p>
        <div className="flex items-center gap-4">
          {!soundOn ? (
            <button
              type="button"
              className="btn btn-primary text-lg font-bold py-3 px-6 shadow-md pulse-dot"
              onClick={enableSound}
            >
              🔊 Tap to Enable Audio Playback
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-xl border border-ok/40 bg-ok-bg px-4 py-2 text-sm font-bold text-ok">
              <span>🔊</span> Audio Enabled (Polly Neural Voice)
            </div>
          )}
        </div>
        {error && <p className="font-semibold text-danger">⚠️ Offline: {error.message}</p>}
      </footer>
    </main>
  );
}
