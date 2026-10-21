"use client";

import { Check } from "lucide-react";

interface ReplyButtonProps {
  id: string;
  residentText: string;
  visitorText: string;
  isSent?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export default function ReplyButton({
  id,
  residentText,
  visitorText,
  isSent = false,
  disabled = false,
  onClick,
}: ReplyButtonProps) {
  return (
    <button
      type="button"
      id={`reply-btn-${id}`}
      onClick={onClick}
      disabled={disabled || isSent}
      className={`group relative flex min-h-[3.75rem] w-full flex-col justify-center rounded-[14px] border-2 px-4 py-3 text-left transition-all duration-150 ${
        isSent
          ? "border-[var(--reply-selected-border)] bg-[var(--reply-selected-bg)] text-[var(--reply-selected-text)] shadow-xs opacity-100 cursor-default"
          : "border-[var(--frame)]/60 bg-[var(--surface)] text-[var(--dusk)] hover:border-[var(--dusk)] hover:bg-[var(--frost)] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-bold leading-tight">
          {residentText}
        </span>
        {isSent && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--reply-badge-bg)] px-2.5 py-1 text-xs font-bold text-[var(--reply-badge-text)] shadow-xs">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Showing on door display
          </span>
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-1 text-xs">
        <span className={`font-semibold ${isSent ? "text-[var(--reply-selected-text)]/90" : "text-[var(--dusk)]"}`}>
          They will see:
        </span>
        <span className={`italic truncate ${isSent ? "text-[var(--reply-selected-text)]" : "text-[var(--frame-text)]"}`}>
          {visitorText}
        </span>
      </div>
    </button>
  );
}
