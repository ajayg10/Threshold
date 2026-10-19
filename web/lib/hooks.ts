"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthError, client } from "./api";
import type { EventRecord } from "./types";

/** Short polling (no WebSockets/SSE by design). Slows down while the tab is hidden. */
export function usePoll<T>(
  load: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  enabled = true,
): { data: T | null; error: Error | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const ctrl = new AbortController();
    const run = async () => {
      try {
        const value = await loadRef.current(ctrl.signal);
        if (!cancelled) {
          setData(value);
          setError(null);
        }
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError(err as Error);
        if (err instanceof AuthError) return; // the access gate takes over
      }
      if (!cancelled) timer = setTimeout(run, document.hidden ? Math.max(intervalMs, 5000) : intervalMs);
    };
    run();
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [intervalMs, enabled, tick]);

  return { data, error, refresh: useCallback(() => setTick((t) => t + 1), []) };
}

const FULL_REFRESH_EVERY = 15; // polls; catches deletions (demo reset, retention expiry)

/** Event feed: incremental `?since=` polls merged by id, with a periodic full refresh. Newest first. */
export function useEvents(intervalMs = 1000): {
  events: EventRecord[];
  loaded: boolean;
  error: Error | null;
  reload: () => void;
} {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const sinceRef = useRef<string | undefined>(undefined);
  const pollsRef = useRef(0);

  const { error, refresh } = usePoll(async (signal) => {
    const full = sinceRef.current === undefined || pollsRef.current++ % FULL_REFRESH_EVERY === 0;
    const batch = await client.events(full ? undefined : sinceRef.current, signal);
    if (full) {
      setEvents(mergeEvents([], batch));
    } else if (batch.length) {
      setEvents((prev) => mergeEvents(prev, batch));
    }
    sinceRef.current = latestUpdate(batch, full ? undefined : sinceRef.current);
    setLoaded(true);
    return batch.length;
  }, intervalMs);

  const reload = useCallback(() => {
    sinceRef.current = undefined;
    refresh();
  }, [refresh]);

  return { events, loaded, error, reload };
}

export function latestUpdate(batch: EventRecord[], current: string | undefined): string | undefined {
  return batch.reduce<string | undefined>((max, e) => (!max || e.updated_at > max ? e.updated_at : max), current);
}

export function mergeEvents(prev: EventRecord[], batch: EventRecord[]): EventRecord[] {
  const byId = new Map(prev.map((e) => [e.event.id, e]));
  for (const e of batch) byId.set(e.event.id, e);
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
