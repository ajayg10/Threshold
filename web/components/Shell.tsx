"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DoorOpen, History, Settings, PlaySquare, ExternalLink, ShieldCheck } from "lucide-react";

const NAV = [
  { href: "/", label: "Door", icon: DoorOpen },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/demo", label: "Demo stage", icon: PlaySquare },
];

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();

  // Visitor door display and 16:9 demo stage manage their own full-screen layout
  if (path?.startsWith("/door") || path?.startsWith("/demo")) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--frost)] text-[var(--dusk)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-[10px] focus:bg-[var(--dusk)] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      {/* Main navigation header */}
      <header className="sticky top-0 z-40 border-b border-[var(--frame)]/30 bg-[var(--surface)]">
        <nav
          aria-label="Resident navigation"
          className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3"
        >
          {/* Brand Wordmark */}
          <Link href="/" className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-[var(--dusk)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--dusk)] text-white">
              <DoorOpen className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <span className="font-display text-2xl font-black">Threshold</span>
          </Link>

          {/* Links */}
          <div className="flex items-center gap-1 sm:gap-2">
            {NAV.map((item) => {
              const active = item.href === "/" ? path === "/" : path?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-[12px] px-3 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-[var(--frost)] text-[var(--dusk)] border border-[var(--frame)]/40"
                      : "text-[var(--frame-text)] hover:text-[var(--dusk)] hover:bg-[var(--frost)]/60"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <Link
              href="/door"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex min-h-[2.5rem] items-center gap-1 rounded-[12px] border border-[var(--frame)]/40 px-3 py-1.5 text-sm font-semibold text-[var(--frame-text)] hover:text-[var(--dusk)] hover:bg-[var(--frost)]/60"
              title="Open visitor door display in a separate tab"
            >
              <span>Door display</span>
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
        </nav>
      </header>

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 px-4 py-6 md:py-8">
        {children}
      </main>

      {/* Security notice footer */}
      <footer className="border-t border-[var(--frame)]/30 bg-[var(--surface)] px-4 py-6 text-xs text-[var(--frame-text)]">
        <div className="mx-auto flex max-w-4xl flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--frame-text)]" strokeWidth={2} />
            <span>Threshold never unlocks anything. Front door interpreter and safety layer only.</span>
          </p>
          <div className="flex items-center gap-4">
            <Link href="/settings" className="hover:underline">Settings</Link>
            <Link href="/demo" className="hover:underline">Demo stage</Link>
            <Link href="/door" target="_blank" className="hover:underline">Door display</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
