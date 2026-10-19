"use client";

import { useEffect, useState } from "react";
import { API_BASE, getHealth, type Health } from "@/lib/api";

type State = { kind: "loading" } | { kind: "ok"; health: Health } | { kind: "error"; message: string };

export default function Home() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    getHealth(ctrl.signal)
      .then((health) => setState({ kind: "ok", health }))
      .catch((err: Error) => {
        if (err.name !== "AbortError") setState({ kind: "error", message: err.message });
      });
    return () => ctrl.abort();
  }, []);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="text-4xl font-bold">Threshold</h1>
      <p className="mt-3 text-muted">
        The front door&apos;s interpreter for people who cannot hear, or cannot speak the visitor&apos;s language.
      </p>

      <section aria-labelledby="status-heading" className="mt-8 rounded-xl bg-surface p-5">
        <h2 id="status-heading" className="text-xl font-semibold">
          Backend status
        </h2>
        <div role="status" aria-live="polite" className="mt-2">
          {state.kind === "loading" && <p>Checking {API_BASE}/health…</p>}
          {state.kind === "ok" && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
              <dt className="font-semibold">Status</dt>
              <dd className="text-ok font-semibold">✓ {state.health.status}</dd>
              <dt className="font-semibold">Version</dt>
              <dd>{state.health.version}</dd>
              <dt className="font-semibold">Environment</dt>
              <dd>
                {state.health.env} ({state.health.region})
              </dd>
              <dt className="font-semibold">Ring API</dt>
              <dd>{state.health.ring_api_configured ? "token configured" : "not configured (test harness only)"}</dd>
            </dl>
          )}
          {state.kind === "error" && (
            <p className="text-danger font-semibold">✗ Backend unreachable: {state.message}</p>
          )}
        </div>
      </section>
    </main>
  );
}
