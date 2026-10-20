"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Door", icon: "🚪" },
  { href: "/history", label: "History", icon: "🕒" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/demo", label: "Simulator", icon: "🎮" },
];

/** App chrome for the resident's screens. The Door Display (/door) renders without it. */
export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (path?.startsWith("/door")) return <>{children}</>;

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-surface/85 backdrop-blur-md shadow-xs">
        <nav aria-label="Main" className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 py-1 text-2xl font-black tracking-tight group">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-gradient text-white shadow-sm transition-transform group-hover:scale-105" aria-hidden="true">
                🚪
              </span>
              <span className="font-display font-extrabold text-foreground">Threshold</span>
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok-bg px-2.5 py-0.5 text-xs font-semibold text-ok">
              <span className="h-2 w-2 rounded-full bg-ok pulse-dot" aria-hidden="true" />
              Live Monitor
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => {
              const active = item.href === "/" ? path === "/" : path?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`nav-link ${active ? "nav-link-active" : ""}`}
                >
                  <span className="text-sm opacity-80" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <Link
              href="/door"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link text-accent hover:underline font-bold ml-1 border border-accent/30 bg-accent/5 hover:bg-accent/10"
              title="Open the visitor-facing Door Display tablet in a new tab"
            >
              <span>Door Tablet</span>
              <span className="text-xs">↗</span>
            </Link>
          </div>
        </nav>
      </header>
      {children}
      <footer className="mx-auto mt-auto w-full max-w-4xl px-4 pb-8 pt-8 text-xs text-muted">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-line/60 pt-4">
          <p className="flex items-center gap-1.5 font-medium">
            <span>🛡️</span>
            <span>Threshold never unlocks or opens anything. Accessibility and safe communications layer only.</span>
          </p>
          <div className="flex items-center gap-3 font-semibold">
            <Link href="/demo" className="text-accent hover:underline">Simulator</Link>
            <span>·</span>
            <Link href="/settings" className="hover:underline">Settings</Link>
            <span>·</span>
            <Link href="/door" target="_blank" className="hover:underline">Door Display</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
