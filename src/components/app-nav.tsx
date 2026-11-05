"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "./ui";

export type NavIcon =
  | "home"
  | "leads"
  | "calendar"
  | "consultations"
  | "availability"
  | "content"
  | "report"
  | "billing"
  | "tattooers"
  | "fairness"
  | "whatsapp"
  | "settings";

export type NavItem = { href: string; label: string; icon: NavIcon; badge?: number };
export type NavGroup = { label?: string; items: NavItem[] };

/** Simple 24px line icons (stroke = currentColor). */
const ICONS: Record<NavIcon, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  leads: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  consultations: (
    <>
      <path d="M9 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  availability: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  content: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9.5" r="1.5" />
      <path d="m21 16-5-5-8 9" />
    </>
  ),
  report: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  billing: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  tattooers: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  fairness: <path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" />,
  whatsapp: <path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

function Icon({ name, className }: { name: NavIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-[18px] shrink-0", className)}
    >
      {ICONS[name]}
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-6">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi}>
          {g.label && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {g.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-muted text-ink"
                        : "text-ink-soft hover:bg-muted/70 hover:text-ink",
                    )}
                  >
                    <Icon name={item.icon} className={active ? "text-ink" : undefined} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white tabular-nums">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserBox({ name, role, signOut }: { name: string; role: string; signOut: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-3 pt-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-ink">
        {name
          .split(/\s+/)
          .map((p) => p[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-ink-soft">{role}</span>
      </span>
      {signOut}
    </div>
  );
}

/** Desktop: fixed sidebar. Mobile: top bar with burger menu (drawer). */
export function AppNav({
  groups,
  logo,
  userName,
  userRole,
  signOut,
}: {
  groups: NavGroup[];
  logo: ReactNode;
  userName: string;
  userRole: string;
  signOut: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape (links close it themselves); no page scrolling behind the open drawer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const badgeTotal = groups.flatMap((g) => g.items).reduce((s, i) => s + (i.badge ?? 0), 0);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-surface lg:flex print:hidden">
        <div className="px-6 pb-6 pt-7">{logo}</div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavList groups={groups} />
        </div>
        <div className="p-3 pb-4">
          <UserBox name={userName} role={userRole} signOut={signOut} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        {logo}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menü öffnen"
          aria-expanded={open}
          className="relative -mr-2 rounded-lg p-2 text-ink hover:bg-muted"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          {badgeTotal > 0 && (
            <span className="absolute right-1 top-1 size-2.5 rounded-full bg-amber-500 ring-2 ring-surface" />
          )}
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menü"
        >
          <button
            type="button"
            aria-label="Menü schließen"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,86vw)] flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between px-5 py-3">
              {logo}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Menü schließen"
                className="-mr-2 rounded-lg p-2 text-ink hover:bg-muted"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <NavList groups={groups} onNavigate={() => setOpen(false)} />
            </div>
            <div className="p-3 pb-6">
              <UserBox name={userName} role={userRole} signOut={signOut} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
