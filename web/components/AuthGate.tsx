"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { API_BASE, AUTH_EVENT, getToken, importTokenFromHash, setToken } from "@/lib/api";

/** Asks for the demo access code (DEMO_TOKEN) once per device. Demo auth, not production auth. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    if (!candidate) return;
    setVerifying(true);
    try {
      // Checked before it is stored, so protected screens never flash with a wrong code.
      const res = await fetch(`${API_BASE}/auth/check`, { headers: { Authorization: `Bearer ${candidate}` } });
      if (!res.ok) throw new Error(String(res.status));
      setToken(candidate);
    } catch {
      setError("That access code did not work. Check it and try again.");
    } finally {
      setVerifying(false);
    }
  }

  if (state === "checking") return null;
  if (state === "open") return <>{children}</>;

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <div className="card p-8 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-2xl text-accent-fg shadow-sm" aria-hidden="true">
            🚪
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Threshold</h1>
            <p className="text-sm font-medium text-muted">Smart Doorbell Interpreter</p>
          </div>
        </div>

        <p className="mt-4 text-base text-muted">
          Welcome! Enter your access code to view the live front door feed, reply panel, and demo scenarios.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="code" className="block text-base font-semibold">
              Access code
            </label>
            <div className="relative mt-1">
              <input
                id="code"
                type={showPassword ? "text" : "password"}
                autoComplete="off"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste DEMO_TOKEN here"
                aria-describedby={error ? "code-error" : undefined}
                className="field pr-12 font-mono text-base"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted hover:text-foreground px-2 py-1"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide access code" : "Show access code"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <p id="code-error" role="alert" className="rounded-lg border border-danger/30 bg-danger-bg p-3 text-sm font-semibold text-danger">
              ⚠️ {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary w-full text-base" disabled={verifying || !code.trim()}>
            {verifying ? "Checking code…" : "Continue into App →"}
          </button>
        </form>

        <div className="mt-6 rounded-lg border border-line-light bg-surface p-3 text-xs text-muted">
          <p className="font-semibold text-foreground">💡 Local testing tip:</p>
          <p className="mt-1">
            The code is in your project root <code className="rounded bg-muted/10 px-1 py-0.5">.env</code> file under <code className="font-bold">DEMO_TOKEN</code>.
          </p>
        </div>
      </div>
    </main>
  );
}
