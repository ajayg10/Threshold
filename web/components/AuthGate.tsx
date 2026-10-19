"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { API_BASE, AUTH_EVENT, getToken, importTokenFromHash, setToken } from "@/lib/api";

/** Asks for the demo access code (DEMO_TOKEN) once per device. Demo auth, not production auth. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    importTokenFromHash();
    const sync = () => setState(getToken() ? "open" : "locked");
    sync();
    window.addEventListener(AUTH_EVENT, sync);
    return () => window.removeEventListener(AUTH_EVENT, sync);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const candidate = code.trim();
    try {
      // Checked before it is stored, so protected screens never flash with a wrong code.
      const res = await fetch(`${API_BASE}/auth/check`, { headers: { Authorization: `Bearer ${candidate}` } });
      if (!res.ok) throw new Error(String(res.status));
      setToken(candidate);
    } catch {
      setError("That access code did not work. Check it and try again.");
    }
  }

  if (state === "checking") return null;
  if (state === "open") return <>{children}</>;
  return (
    <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 py-12">
      <h1 className="text-3xl font-bold">Threshold</h1>
      <p className="mt-2 text-muted">Enter the demo access code to continue.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label htmlFor="code" className="block font-semibold">
          Access code
        </label>
        <input
          id="code"
          type="password"
          autoComplete="off"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-describedby={error ? "code-error" : undefined}
          className="field"
        />
        {error && (
          <p id="code-error" role="alert" className="font-semibold text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full">
          Continue
        </button>
      </form>
    </main>
  );
}
