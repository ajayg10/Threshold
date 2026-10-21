"use client";

import { useState } from "react";
import { EventRecord, TrustedContact } from "@/lib/types";
import { getVisitorTypeLabel } from "@/lib/copy";
import StatusRow from "./StatusRow";
import RiskBand from "./RiskBand";
import SeamBlock from "./SeamBlock";
import ReplyButton from "./ReplyButton";
import StageProgress from "./StageProgress";
import {
  Truck,
  Wrench,
  UserCheck,
  Megaphone,
  AlertOctagon,
  VolumeX,
  HelpCircle,
  PhoneCall,
  CalendarCheck2,
  Send,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface VisitorCardViewProps {
  record?: EventRecord | null;
  trustedContacts?: TrustedContact[];
  onReply: (body: { reply_id: string } | { text: string }) => Promise<void>;
  onEscalate?: (contactId?: string) => Promise<void>;
  onRetry?: () => void;
  isNewArrival?: boolean;
  isOffline?: boolean;
}

export default function VisitorCardView({
  record,
  trustedContacts = [],
  onReply,
  onEscalate,
  onRetry,
  isNewArrival = false,
  isOffline = false,
}: VisitorCardViewProps) {
  const [customText, setCustomText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentReplyId, setSentReplyId] = useState<string | null>(null);
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);

  // 1. OFFLINE STATE
  if (isOffline) {
    return (
      <article
        role="region"
        aria-label="Doorbell offline status"
        className="w-full max-w-2xl rounded-[20px] border-2 border-[var(--frame)] bg-[var(--surface)] p-6 text-[var(--dusk)] shadow-sm"
      >
        <StatusRow />
        <div className="py-12 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-[var(--frame-text)]" strokeWidth={2} />
          <h2 className="text-xl font-bold font-display">Door connection offline</h2>
          <p className="mt-2 text-base text-[var(--frame-text)]">
            We cannot reach the front door interpreter right now. Please verify your internet connection.
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              type="button"
              className="mt-6 inline-flex min-h-[3rem] items-center gap-2 rounded-[14px] border-2 border-[var(--dusk)] bg-[var(--dusk)] px-5 py-2.5 font-bold text-white hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Retry connection</span>
            </button>
          )}
        </div>
      </article>
    );
  }

  // 2. IDLE STATE: Nobody at the door
  if (!record || !record.event) {
    return (
      <article
        role="region"
        aria-label="Front door status"
        className="w-full max-w-2xl rounded-[20px] border-2 border-[var(--frame)] bg-[var(--surface)] p-6 text-[var(--dusk)] shadow-sm"
      >
        <StatusRow />
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--frame)]/10 text-[var(--frame-text)]">
            <UserCheck className="h-7 w-7" strokeWidth={2} />
          </div>
          <h2 className="text-2xl font-bold font-display">Nobody at the door</h2>
          <p className="mt-2 max-w-md mx-auto text-base text-[var(--frame-text)]">
            New visitors appear here the moment the bell rings. You will see what they say translated live.
          </p>
        </div>
      </article>
    );
  }

  // 3. ERROR STATE
  if (record.status === "error") {
    return (
      <article
        role="alert"
        aria-label="Visit understanding error"
        className="w-full max-w-2xl rounded-[20px] border-2 border-[var(--alarm)] bg-[var(--surface)] p-6 text-[var(--dusk)] shadow-sm"
      >
        <StatusRow />
        <div className="py-10 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-[var(--alarm)]" strokeWidth={2} />
          <h2 className="text-xl font-bold">We couldn&apos;t understand this visit</h2>
          <p className="mt-2 text-base text-[var(--frame-text)]">
            {record.error || "The audio was unclear or interrupted. You can ask them to repeat on the door display."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => onReply({ text: "Could you please repeat what you said?" })}
              type="button"
              className="inline-flex min-h-[3.5rem] items-center gap-2 rounded-[14px] bg-[var(--dusk)] px-6 py-3 font-bold text-white hover:opacity-90"
            >
              Ask them to repeat on door
            </button>
            {onRetry && (
              <button
                onClick={onRetry}
                type="button"
                className="inline-flex min-h-[3.5rem] items-center gap-2 rounded-[14px] border-2 border-[var(--frame)] bg-[var(--surface)] px-5 py-3 font-semibold text-[var(--dusk)] hover:bg-[var(--frost)]"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }

  // 4. PROCESSING STATE: Stage progress
  if (record.status === "processing") {
    const stage = (record as any).stage || "heard";
    return (
      <article
        role="region"
        aria-live="polite"
        aria-label="Visitor speech processing"
        className={`w-full max-w-2xl rounded-[20px] border-2 border-[var(--frame)] bg-[var(--surface)] p-6 text-[var(--dusk)] shadow-sm ${
          isNewArrival ? "porch-arrival" : ""
        }`}
      >
        <StatusRow />
        <div className="my-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[var(--porch)] animate-pulse" />
              <h2 className="text-lg font-bold">Doorbell rang</h2>
            </div>
            <span className="text-xs font-semibold text-[var(--frame-text)]">Listening...</span>
          </div>

          <StageProgress currentStage={stage} />
        </div>
      </article>
    );
  }

  // 5. READY STATE (Visitor Card Hero)
  const card = record.card!;
  const visitorType = card.visitor_type;
  const isEmergency = visitorType === "emergency";
  const highRisk = card.risk_level === "high" || isEmergency;
  const primaryContact = trustedContacts[0] || { name: "Trusted contact", phone: "112" };

  const getVisitorIcon = () => {
    switch (visitorType) {
      case "delivery":
        return Truck;
      case "service":
        return Wrench;
      case "known_contact":
        return UserCheck;
      case "solicitor":
        return Megaphone;
      case "emergency":
        return AlertOctagon;
      case "no_speech":
        return VolumeX;
      default:
        return HelpCircle;
    }
  };

  const VisitorIcon = getVisitorIcon();

  const handleSelectSuggested = async (replyId: string) => {
    try {
      setSubmitting(true);
      await onReply({ reply_id: replyId });
      setSentReplyId(replyId);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim() || submitting) return;
    try {
      setSubmitting(true);
      await onReply({ text: customText.trim() });
      setSentReplyId("custom");
      setCustomText("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEscalate = async () => {
    if (!onEscalate || escalating) return;
    try {
      setEscalating(true);
      await onEscalate(primaryContact.id);
      setEscalated(true);
    } finally {
      setEscalating(false);
    }
  };

  const recentReply = record.replies && record.replies.length > 0 ? record.replies[record.replies.length - 1] : null;

  return (
    <article
      role="region"
      aria-label="Visitor at front door"
      className={`w-full max-w-2xl rounded-[20px] border-2 border-[var(--frame)] bg-[var(--surface)] p-5 md:p-6 text-[var(--dusk)] shadow-sm ${
        isNewArrival ? "porch-arrival" : ""
      }`}
    >
      {/* 1. Status row */}
      <StatusRow />

      {/* 2. Header: Visitor type + source badge */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--frame)]/15 text-[var(--dusk)]">
            <VisitorIcon className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="text-xl font-bold font-display tracking-tight">
            {getVisitorTypeLabel(visitorType)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {record.event.source !== "ring_api" && (
            <span className="rounded-full bg-[var(--frame)]/15 px-2.5 py-0.5 text-xs font-semibold text-[var(--frame-text)]">
              {record.event.source === "seeded" ? "Seeded demo audio" : "Simulated"}
            </span>
          )}
          <span className="text-xs font-medium text-[var(--frame-text)]">Just now</span>
        </div>
      </div>

      {/* 3. Risk Band */}
      <div className="mt-4">
        <RiskBand
          riskLevel={card.risk_level}
          visitorType={visitorType}
          summary={card.summary}
          flags={card.risk_flags}
        />
      </div>

      {/* 4. Matched expected visit banner (when present) */}
      {card.matched_expected_visit && (
        <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-[var(--safe-border)] bg-[var(--safe-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--safe)]">
          <CalendarCheck2 className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          <span>Matches your expected visit: {card.matched_expected_visit.label}</span>
        </div>
      )}

      {/* 5. The Seam Block: Outside / Inside */}
      <div className="mt-4">
        <SeamBlock
          transcript={card.transcript}
          translation={card.translation}
          detectedLanguage={card.detected_language}
          residentLanguage="en-IN"
        />
      </div>

      {/* Reply confirmation banner when already answered */}
      {recentReply && (
        <div className="mt-4 flex items-center justify-between rounded-[12px] border border-[var(--safe-border)] bg-[var(--safe-bg)] p-3 text-sm text-[var(--safe)]">
          <div>
            <span className="font-bold">Showing on door display: </span>
            <span>“{recentReply.visitor_text}”</span>
          </div>
          <button
            onClick={() => onReply({ text: recentReply.resident_text })}
            type="button"
            className="text-xs font-bold underline hover:opacity-80"
          >
            Replay
          </button>
        </div>
      )}

      {/* 6. Suggested Replies: 3 large buttons (min 56px) */}
      <section aria-label="Suggested quick replies" className="mt-6 space-y-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--frame-text)]">
          Choose a reply to show at the door
        </h3>
        <div className="space-y-2.5">
          {card.suggested_replies.map((reply) => (
            <ReplyButton
              key={reply.id}
              id={reply.id}
              residentText={reply.resident_text}
              visitorText={reply.visitor_text}
              isSent={sentReplyId === reply.id || recentReply?.suggestion_id === reply.id}
              disabled={submitting}
              onClick={() => handleSelectSuggested(reply.id)}
            />
          ))}
        </div>
      </section>

      {/* 7. Custom reply input */}
      <form onSubmit={handleSendCustom} className="mt-5 space-y-2">
        <label htmlFor="custom-reply-field" className="block text-xs font-bold uppercase tracking-wider text-[var(--frame-text)]">
          Type your own reply
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="custom-reply-field"
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Type a message to translate and display..."
            className="flex-1 rounded-[14px] border-2 border-[var(--frame)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--dusk)] placeholder:text-[var(--frame-text)]/70 focus:border-[var(--dusk)]"
          />
          <button
            type="submit"
            disabled={!customText.trim() || submitting}
            className="inline-flex min-h-[3.5rem] w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-[14px] bg-[var(--dusk)] px-5 py-3 font-bold text-white hover:opacity-95 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span>Show on door display</span>
          </button>
        </div>
      </form>

      {/* 8. Contextual Escalation / Emergency Actions */}
      {(card.escalation?.required || highRisk || isEmergency) && (
        <section aria-label="Safety escalation" className="mt-6 border-t border-[var(--frame)]/30 pt-4">
          <div className="flex flex-wrap gap-3">
            {isEmergency ? (
              <a
                href="tel:112"
                className="inline-flex min-h-[3.5rem] flex-1 items-center justify-center gap-2 rounded-[14px] bg-[var(--alarm)] px-5 py-3 text-base font-bold text-white hover:opacity-95"
              >
                <PhoneCall className="h-5 w-5" />
                <span>Call Emergency Services (112)</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={handleEscalate}
                disabled={escalating || escalated}
                className="inline-flex min-h-[3.5rem] flex-1 items-center justify-center gap-2 rounded-[14px] border-2 border-[var(--alarm)] bg-[var(--alarm-bg)] px-5 py-3 text-base font-bold text-[var(--alarm)] hover:opacity-90"
              >
                <PhoneCall className="h-5 w-5" />
                <span>
                  {escalated
                    ? `Notified ${primaryContact.name}`
                    : `Call ${primaryContact.name} (${primaryContact.relation || "Contact"})`}
                </span>
              </button>
            )}
          </div>
        </section>
      )}
    </article>
  );
}
