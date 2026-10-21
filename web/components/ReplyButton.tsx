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
      className={`group relative flex min-h-[3.75rem] w-full flex-col justify-center rounded-[14px] border-2 px-4 py-3 text-left transition-colors duration-150 ${
        isSent
          ? "border-[var(--safe)] bg-[var(--safe-bg)] text-[var(--dusk)]"
          : "border-[var(--frame)] bg-[var(--surface)] text-[var(--dusk)] hover:border-[var(--dusk)] hover:bg-[var(--frost)] active:scale-[0.99]"
      } disabled:cursor-not-allowed disabled:opacity-70`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-bold leading-tight">
          {residentText}
        </span>
        {isSent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--safe)] px-2 py-0.5 text-xs font-semibold text-white">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Showing on door display
          </span>
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-1 text-xs text-[var(--frame-text)]">
        <span className="font-semibold text-[var(--dusk)]">They will see:</span>
        <span className="italic truncate">{visitorText}</span>
      </div>
    </button>
  );
}
