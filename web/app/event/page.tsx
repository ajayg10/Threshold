"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import VisitorCardView from "@/components/VisitorCardView";
import LatencyWaterfall from "@/components/LatencyWaterfall";
import { client } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { EventRecord, ResidentSettings } from "@/lib/types";
import { ArrowLeft, Clock } from "lucide-react";

export default function EventPage() {
  return (
    <Suspense fallback={<p className="text-center py-12 text-[var(--frame-text)]">Loading visit...</p>}>
      <EventView />
    </Suspense>
  );
}

function EventView() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const { data: record, error } = usePoll((signal) => client.event(id, signal), 1000, !!id);
  const [settings, setSettings] = useState<ResidentSettings | null>(null);

  useEffect(() => {
    client.settings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const handleReply = async (body: { reply_id: string } | { text: string }) => {
    if (!record) return;
    await client.reply(record.event.id, body);
  };

  const handleEscalate = async (contactId?: string) => {
    if (!record) return;
    await client.escalate(record.event.id, contactId);
  };

  if (!id) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-[var(--dusk)]">
        <p className="text-lg font-bold">No visit selected</p>
        <Link href="/" className="mt-4 inline-flex items-center gap-1.5 font-bold hover:underline">
          <ArrowLeft className="h-4 w-4" />
          <span>Return to front door</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
      <div className="mb-4 flex w-full items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--dusk)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to front door</span>
        </Link>

        {record?.created_at && (
          <div className="flex items-center gap-1 text-xs text-[var(--frame-text)]">
            <Clock className="h-3.5 w-3.5" />
            <time dateTime={record.created_at}>
              {new Date(record.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </time>
          </div>
        )}
      </div>

      <VisitorCardView
        record={record}
        trustedContacts={settings?.trusted_contacts || []}
        onReply={handleReply}
        onEscalate={handleEscalate}
        isOffline={!record && !!error}
      />

      {record?.card?.timings_ms && (
        <div className="mt-6 w-full">
          <LatencyWaterfall timings={record.card.timings_ms} />
        </div>
      )}
    </div>
  );
}
