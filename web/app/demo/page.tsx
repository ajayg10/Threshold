"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { client } from "@/lib/api";
import { FIXTURE_SCENARIOS } from "@/lib/fixtures";
import LatencyWaterfall from "@/components/LatencyWaterfall";
import { useEvents } from "@/lib/hooks";
import { DoorOpen, RotateCcw, Smartphone, Tablet, ExternalLink } from "lucide-react";

export default function DemoStagePage() {
  const [activeScenario, setActiveScenario] = useState<string>("s1_delivery_hi");
  const [triggering, setTriggering] = useState<string | null>(null);
  const [lastTimings, setLastTimings] = useState<{
    transcribe: number;
    perceive: number;
    policy: number;
    total: number;
  }>({
    transcribe: 1420,
    perceive: 1150,
    policy: 680,
    total: 3250,
  });

  const { events, reload } = useEvents(1000);
  const phoneIframeRef = useRef<HTMLIFrameElement>(null);
  const doorIframeRef = useRef<HTMLIFrameElement>(null);

  // Sync timings from latest ready event
  useEffect(() => {
    if (events.length > 0 && events[0].card?.timings_ms) {
      const t = events[0].card.timings_ms;
      setLastTimings({
        transcribe: t.transcribe,
        perceive: t.perceive,
        policy: t.policy,
        total: t.total,
      });
    }
  }, [events]);

  const handleTrigger = async (scenarioId: string) => {
    setActiveScenario(scenarioId);
    setTriggering(scenarioId);
    try {
      await client.trigger(scenarioId);
      reload();
    } finally {
      setTimeout(() => setTriggering(null), 500);
    }
  };

  const handleReset = async () => {
    setTriggering("reset");
    try {
      await client.reset();
      reload();
    } finally {
      setTimeout(() => setTriggering(null), 500);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--frost)] text-[var(--dusk)] selection:bg-[var(--porch)]">
      {/* 1. TOP CONTROL BAR */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--frame)]/40 bg-[var(--surface)] px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] shadow-xs">
              <DoorOpen className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <span className="font-display text-2xl font-black tracking-tight">Threshold</span>
          </Link>
          <span className="hidden lg:inline text-xs font-semibold text-[var(--frame-text)]">
            Demo stage (16:9 recording mode)
          </span>
        </div>

        {/* Scenario Controls */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {FIXTURE_SCENARIOS.map((sc) => {
            const isActive = activeScenario === sc.id;
            const isBusy = triggering === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => handleTrigger(sc.id)}
                disabled={triggering !== null}
                className={`rounded-full px-3.5 py-1 text-xs font-bold transition-all disabled:opacity-50 ${
                  isActive ? "btn-selected" : "btn-unselected"
                }`}
              >
                {isBusy ? "Triggering..." : sc.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleReset}
            disabled={triggering !== null}
            title="Reset events and state"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--frame)]/40 bg-[var(--surface)] px-3 py-1 text-xs font-bold text-[var(--alarm)] hover:bg-[var(--alarm-bg)]"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </button>
        </div>
      </header>

      {/* 2. DUAL IFRAME STAGE (Phone + Door Tablet) */}
      <main className="flex flex-1 items-center justify-center gap-8 overflow-hidden p-6">
        {/* LEFT: RESIDENT PHONE (390x844 aspect frame) */}
        <div className="flex h-full max-h-[820px] w-[390px] flex-col rounded-[24px] border-4 border-[var(--frame)]/50 bg-[var(--surface)] shadow-md overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--frame)]/25 bg-[var(--surface)] px-4 py-2 text-xs font-bold text-[var(--frame-text)]">
            <div className="flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5" />
              <span>Resident phone</span>
            </div>
            <Link href="/" target="_blank" className="hover:text-[var(--dusk)]">
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <iframe
            ref={phoneIframeRef}
            src="/"
            title="Resident phone view"
            className="flex-1 w-full border-0 bg-[var(--frost)]"
          />
        </div>

        {/* RIGHT: DOOR DISPLAY TABLET (16:10 aspect frame) */}
        <div className="flex h-full max-h-[820px] flex-1 max-w-[850px] flex-col rounded-[24px] border-4 border-[var(--frame)]/50 bg-[var(--surface)] shadow-md overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--frame)]/25 bg-[var(--surface)] px-4 py-2 text-xs font-bold text-[var(--frame-text)]">
            <div className="flex items-center gap-1.5">
              <Tablet className="h-3.5 w-3.5" />
              <span>Door display (Visitor-facing tablet)</span>
            </div>
            <Link href="/door" target="_blank" className="hover:text-[var(--dusk)]">
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <iframe
            ref={doorIframeRef}
            src="/door"
            title="Door display tablet view"
            className="flex-1 w-full border-0 bg-[var(--frost)]"
          />
        </div>
      </main>

      {/* 3. BOTTOM PIPELINE SPEED & WATERFALL BAR */}
      <footer className="h-16 shrink-0 border-t border-[var(--frame)]/40 bg-[var(--surface)] px-6 flex items-center justify-between">
        <div className="w-full max-w-4xl mx-auto">
          <LatencyWaterfall timings={lastTimings} />
        </div>
      </footer>
    </div>
  );
}
