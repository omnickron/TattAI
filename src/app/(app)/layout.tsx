import type { ReactNode } from "react";
import { NavLinks } from "@/components/nav-links";
import { requireUser } from "@/lib/auth/session";
import { signOutAction } from "./actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const items = [
    { href: "/leads", label: "Leads" },
    ...(isAdmin
      ? [
          { href: "/admin/tattooers", label: "Tätowierer" },
          { href: "/admin/settings", label: "Einstellungen" },
        ]
      : []),
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-xs font-bold text-paper">
              T
            </span>
            <span className="font-semibold tracking-tight">TattAI</span>
          </div>
          <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
            <NavLinks items={items} />
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft md:inline">
              {user.name} · {isAdmin ? "Admin" : "Tätowierer"}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-lg px-2 py-1 text-ink-soft hover:bg-muted hover:text-ink"
              >
                Abmelden
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-16">{children}</main>
    </div>
  );
}
