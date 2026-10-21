"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { DOOR_LOCKED_TEXT } from "@/lib/copy";

interface StatusRowProps {
  className?: string;
}

export default function StatusRow({ className = "" }: StatusRowProps) {
  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header
      role="banner"
      aria-label="Door and system status"
      className={`flex items-center justify-between border-b border-[var(--frame)]/40 pb-3 pt-1 text-[var(--dusk)] ${className}`}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center rounded-full bg-[var(--frame)]/15 p-1.5 text-[var(--dusk)]"
          aria-hidden="true"
        >
          <Lock className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <span className="text-base font-bold tracking-tight">
          {DOOR_LOCKED_TEXT}
        </span>
      </div>

      <div className="text-sm font-semibold text-[var(--frame-text)]" aria-label={`Current time ${timeStr}`}>
        {timeStr}
      </div>
    </header>
  );
}
