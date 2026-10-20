"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Door" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
  { href: "/demo", label: "🎮 Demo Panel" },
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
      <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur-md">
        <nav aria-label="Main" className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 py-1 text-2xl font-bold tracking-tight">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-sm" aria-hidden="true">
                🚪
              </span>
              <span>Threshold</span>
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok-bg px-2.5 py-0.5 text-xs font-semibold text-ok">
              <span className="h-2 w-2 rounded-full bg-ok pulse-dot" aria-hidden="true" />
              Active
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
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/door"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link text-accent hover:underline font-semibold ml-1"
              title="Open the visitor-facing Door Display tablet in a new tab"
            >
              Door Display ↗
            </Link>
          </div>
        </nav>
      </header>
      {children}
      <footer className="mx-auto mt-auto w-full max-w-4xl px-4 pb-8 pt-6 text-sm text-muted">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-line/60 pt-4">
          <p>Threshold never unlocks or opens anything. It is not a life-safety system.</p>
          <div className="flex gap-4">
            <Link href="/demo" className="hover:underline">Demo Panel</Link>
            <span>·</span>
            <Link href="/settings" className="hover:underline">Settings</Link>
            <span>·</span>
            <Link href="/door" target="_blank" className="hover:underline">Door Tablet</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
