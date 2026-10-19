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
    replay: "Play again",
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
    <>
      <p lang={order[0]} className="text-5xl font-bold leading-tight sm:text-6xl">
        {text[order[0]]}
      </p>
      <p lang={order[1]} className="mt-6 text-3xl text-muted sm:text-4xl">
        {text[order[1]]}
      </p>
    </>
  );
}

export default function DoorDisplayPage() {
  const { data: feed, error } = usePoll((signal) => client.door(signal), 1000);
  const [soundOn, setSoundOn] = useState(false);
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
    audio.current.play().catch(() => setSoundOn(false));
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
    <main id="main" className="flex min-h-screen flex-col justify-between bg-background p-6 sm:p-12">
      <div aria-live="polite" className="flex flex-1 flex-col justify-center">
        {mode.kind === "reply" ? (
          <>
            <p lang={mode.reply.visitor_language} className="text-5xl font-bold leading-tight sm:text-7xl">
              {mode.reply.visitor_text}
            </p>
            <button
              type="button"
              className="btn mt-10 self-start text-2xl"
              onClick={() => play(mode.reply.audio_url)}
              disabled={!mode.reply.audio_url}
            >
              ▶ {COPY[mode.reply.visitor_language.startsWith("hi") ? "hi" : "en"].replay}
            </button>
          </>
        ) : mode.kind === "wait" ? (
          <Bilingual text={{ en: COPY.en.wait, hi: COPY.hi.wait }} first={mode.lang} />
        ) : (
          <Bilingual text={{ en: COPY.en.idle, hi: COPY.hi.idle }} first={null} />
        )}
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 text-base text-muted">
        <p>Threshold Door Display · shows the resident&apos;s replies · this is not the Ring doorbell</p>
        {!soundOn ? (
          <button type="button" className="btn btn-primary text-xl" onClick={enableSound}>
            🔊 Tap to turn on sound
          </button>
        ) : (
          <p>🔊 Sound on</p>
        )}
        {error && <p className="font-semibold text-danger">Offline: {error.message}</p>}
      </footer>
    </main>
  );
}
