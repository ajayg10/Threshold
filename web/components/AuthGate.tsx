"use client";

import { useEffect, type ReactNode } from "react";
import { getToken, importTokenFromHash } from "@/lib/api";

/**
 * Open Hackathon Demo Access:
 * Automatically ensures the demo token is loaded so judges and visitors
 * access all screens, feeds, and actions immediately without an access key barrier.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  useEffect(() => {
    importTokenFromHash();
    // Ensure default demo token is initialized
    getToken();
  }, []);

  return <>{children}</>;
}
