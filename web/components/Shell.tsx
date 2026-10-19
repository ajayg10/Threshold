"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Door" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
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
      <header className="border-b border-line">
        <nav aria-label="Main" className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-1 px-4 py-2">
          <Link href="/" className="mr-auto basis-full py-1 text-xl font-bold sm:basis-auto sm:py-2">
            Threshold
          </Link>
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
        </nav>
      </header>
      {children}
      <footer className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 text-base text-muted">
        Threshold never unlocks or opens anything. It is not a life-safety system.
      </footer>
    </>
  );
}
