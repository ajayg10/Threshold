interface LatencyWaterfallProps {
  timings?: {
    transcribe?: number;
    perceive?: number;
    policy?: number;
    total?: number;
  };
  className?: string;
}

export default function LatencyWaterfall({ timings, className = "" }: LatencyWaterfallProps) {
  const transcribe = timings?.transcribe || 0;
  const perceive = timings?.perceive || 0;
  const policy = timings?.policy || 0;
  const total = timings?.total || transcribe + perceive + policy || 1;

  const pct = (val: number) => Math.max(5, Math.round((val / total) * 100));

  return (
    <div
      role="region"
      aria-label="Pipeline latency breakdown"
      className={`rounded-[14px] border border-[var(--frame)]/40 bg-[var(--surface)] p-3 text-xs text-[var(--dusk)] ${className}`}
    >
      <div className="mb-2 flex items-center justify-between font-bold">
        <span className="text-[var(--frame-text)]">Pipeline speed</span>
        <span>Total {(total / 1000).toFixed(1)} s</span>
      </div>

      {/* Waterfall bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--frame)]/20" aria-hidden="true">
        <div
          style={{ width: `${pct(transcribe)}%` }}
          className="bg-[var(--frame)] transition-all"
          title={`Transcribe: ${(transcribe / 1000).toFixed(1)} s`}
        />
        <div
          style={{ width: `${pct(perceive)}%` }}
          className="bg-[var(--porch)] transition-all"
          title={`Understand: ${(perceive / 1000).toFixed(1)} s`}
        />
        <div
          style={{ width: `${pct(policy)}%` }}
          className="bg-[var(--safe)] transition-all"
          title={`Safety policy: ${(policy / 1000).toFixed(1)} s`}
        />
      </div>

      {/* Legend / Metrics */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--frame-text)]">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--frame)]" />
          <span>Transcribe {(transcribe / 1000).toFixed(1)} s</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--porch)]" />
          <span>Perceive {(perceive / 1000).toFixed(1)} s</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--safe)]" />
          <span>Safety {(policy / 1000).toFixed(1)} s</span>
        </div>
      </div>
    </div>
  );
}
