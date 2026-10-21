"use client";

import { useEffect, useRef, useState } from "react";
import { client } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { getIdleVisitorText } from "@/lib/copy";
import { Volume2 } from "lucide-react";

export default function DoorDisplayPage() {
  const { data: feed } = usePoll((signal) => client.door(signal), 1000);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeReply, setActiveReply] = useState<{
    id: string;
    visitor_text: string;
    visitor_language: string;
    audio_url?: string | null;
  } | null>(null);

  const playedReplyId = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Monitor incoming replies
  useEffect(() => {
    if (!feed?.reply) return;

    const reply = feed.reply;
    setActiveReply({
      id: reply.id,
      visitor_text: reply.visitor_text,
      visitor_language: reply.visitor_language,
      audio_url: reply.audio_url,
    });

    // Play speech audio once per new reply
    if (playedReplyId.current !== reply.id) {
      playedReplyId.current = reply.id;
      if (reply.audio_url) {
        if (audioRef.current) audioRef.current.pause();
        const a = new Audio(reply.audio_url);
        audioRef.current = a;
        setIsPlaying(true);
        a.onended = () => setIsPlaying(false);
        a.onerror = () => setIsPlaying(false);
        a.play().catch(() => setIsPlaying(false));
      } else {
        // Fallback to speech synthesis if no remote audio url
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(reply.visitor_text);
          u.lang = reply.visitor_language || "hi-IN";
          setIsPlaying(true);
          u.onend = () => setIsPlaying(false);
          u.onerror = () => setIsPlaying(false);
          window.speechSynthesis.speak(u);
        }
      }
    }

    // Wake behavior: 30-second return to idle
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setActiveReply(null);
    }, 30000);

    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [feed?.reply]);

  const lang = activeReply?.visitor_language || feed?.latest_event?.visitor_language || "en";
  const isHindi = lang.toLowerCase().startsWith("hi");
  const idleText = getIdleVisitorText(lang);

  return (
    <div
      className="fixed inset-0 flex flex-col justify-between overflow-hidden bg-[var(--frost)] p-8 md:p-16 text-[var(--dusk)] select-none"
      aria-live="polite"
    >
      {/* Top minimal status indicator: Door lock glyph */}
      <header className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-[var(--frame-text)]">
        <span>Door interpreter</span>
        {isPlaying && (
          <div className="flex items-center gap-2 text-[var(--porch)]">
            <Volume2 className="h-5 w-5 animate-pulse" strokeWidth={2.5} />
            <span>Speaking reply</span>
          </div>
        )}
      </header>

      {/* Main Center Chamber: High Contrast Text for Visitor */}
      <main className="my-auto flex flex-col justify-center">
        {activeReply ? (
          <div className="space-y-6">
            <h1
              lang={lang.split("-")[0]}
              className={`leading-tight font-bold text-[var(--dusk)] ${
                isHindi ? "font-hindi" : "font-sans"
              } text-4xl sm:text-6xl md:text-7xl`}
            >
              {activeReply.visitor_text}
            </h1>
          </div>
        ) : (
          <div className="max-w-4xl">
            <h1
              lang={lang.split("-")[0]}
              className={`text-2xl sm:text-4xl md:text-5xl font-medium leading-relaxed text-[var(--frame-text)] ${
                isHindi ? "font-hindi" : "font-sans"
              }`}
            >
              {idleText}
            </h1>
          </div>
        )}
      </main>

      {/* Bottom subtle anchor */}
      <footer className="text-xs text-[var(--frame-text)]/60">
        <span>Threshold</span>
      </footer>
    </div>
  );
}
