"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The single app header.
 *
 * Before this, the app had two different navigation treatments: a 190px
 * sidebar with its own nav list on the chat screen, and an inline "dash-head"
 * bar on the dashboard and settings screens. They disagreed on height, type
 * size, active-state styling and breakpoint, so the product looked like two
 * products. This component is now the only place primary navigation lives —
 * every route renders it, and the sidebar is reduced to a conversation list.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  {
    href: "/chat",
    label: "Chat",
    icon: (
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    ),
  },
  {
    href: "/dashboard",
    label: "Usage & cost",
    icon: <path d="M3 3v18h18M7 15l3-4 3 3 5-7" />,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </>
    ),
  },
];

export function AppHeader({
  right,
  onOpenSidebar,
  showSidebarToggle = false,
}: {
  right?: React.ReactNode;
  onOpenSidebar?: () => void;
  showSidebarToggle?: boolean;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[var(--color-canvas)]/90 px-3 backdrop-blur sm:px-4">
      {showSidebarToggle && (
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open conversations"
          className="rounded-lg border border-white/10 p-2 text-[var(--color-ink-3)] transition hover:bg-white/5 md:hidden"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      )}

      <Link
        href="/chat"
        className="flex shrink-0 items-center gap-2 rounded-lg"
        aria-label="WADE home"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-brand-strong)] to-[var(--color-violet)] text-xs font-bold text-white">
          W
        </span>
        <span className="text-sm font-semibold tracking-tight text-[var(--color-ink-1)]">
          WADE
        </span>
      </Link>

      <nav aria-label="Primary" className="min-w-0 flex-1">
        <ul className="flex items-center gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition ${
                    active
                      ? "bg-white/10 font-medium text-[var(--color-ink-1)]"
                      : "text-[var(--color-ink-4)] hover:bg-white/5 hover:text-[var(--color-ink-2)]"
                  }`}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    {item.icon}
                  </svg>
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.label.split(" ")[0]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}
