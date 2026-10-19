// "/api" in production (same CloudFront domain); http://localhost:8000/api in local dev.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export type Health = {
  status: string;
  version: string;
  env: string;
  region: string;
  store: string;
  ring_api_configured: boolean;
  precomputed_transcripts: boolean;
};

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch(`${API_BASE}/health`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
  return res.json();
}
