import type { ReactNode } from "react";
import Link from "next/link";
import { AppNav, type NavGroup } from "@/components/app-nav";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/logo";
import { dueFollowUpWhere } from "@/lib/outcomes/follow-up";
import { openHandoverWhere } from "@/lib/bot/handover";
import { APP_TIMEZONE } from "@/lib/format";
import { ViewSwitch } from "@/components/view-switch";
import { PushToggle } from "@/components/push-toggle";
import { isOperator } from "@/lib/auth/operator";
import { vapidPublicKey } from "@/lib/push";
import { signOutAction } from "./actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  // Past consultations still waiting for their outcome
  const openOutcomes = await prisma.consultation.count({
    where: {
      status: "SCHEDULED",
      endsAt: { lte: new Date() },
      lead: { isTest: false },
      ...(isAdmin ? {} : { tattooerId: user.tattooerProfile?.id ?? "__none__" }),
    },
  });
  // Chats the bot handed over that nobody has picked up yet
  const handovers = await prisma.lead.count({
    where: openHandoverWhere({ isAdmin, tattooerId: user.tattooerProfile?.id ?? null }),
  });
  const followUps = await prisma.consultation.count({
    where: dueFollowUpWhere(
      new Date(),
      { isAdmin, tattooerId: user.tattooerProfile?.id ?? null },
      APP_TIMEZONE,
    ),
  });
  const groups: NavGroup[] = [
    {
      items: [
        { href: "/", label: "Übersicht", icon: "home", badge: handovers + followUps },
        { href: "/leads", label: "Leads", icon: "leads" },
        { href: "/calendar", label: "Kalender", icon: "calendar" },
        { href: "/consultations", label: "Beratungen", icon: "consultations", badge: openOutcomes },
        ...(user.tattooerProfile
          ? [{ href: "/availability", label: "Verfügbarkeit", icon: "availability" as const }]
          : []),
        { href: "/content", label: "Content", icon: "content" },
      ],
    },
    ...(isAdmin
      ? [
          {
            label: "Studio",
            items: [
              { href: "/admin/dashboard", label: "Auswertung", icon: "report" as const },
              { href: "/admin/billing", label: "Abrechnung", icon: "billing" as const },
              { href: "/admin/tattooers", label: "Tätowierer", icon: "tattooers" as const },
              { href: "/admin/fairness", label: "Fairness", icon: "fairness" as const },
              { href: "/admin/whatsapp", label: "WhatsApp", icon: "whatsapp" as const },
              { href: "/admin/bot", label: "Bot", icon: "bot" as const },
              { href: "/admin/settings", label: "Einstellungen", icon: "settings" as const },
            ],
          },
        ]
      : []),
    ...(isOperator(user) && !user.viewingAsTattooer
      ? [
          {
            label: "Betreiber",
            items: [{ href: "/operator", label: "Bot & Abrechnung", icon: "operator" as const }],
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-dvh">
      <AppNav
        groups={groups}
        logo={
          <Link href="/" className="text-xl" aria-label="NEEDL – Übersicht">
            <Logo />
          </Link>
        }
        userName={user.name}
        userRole={
          isOperator(user) && user.tattooerProfile ? (
            <ViewSwitch current={user.viewingAsTattooer ? "tattooer" : "admin"} />
          ) : isAdmin ? (
            "Admin"
          ) : (
            "Tätowierer"
          )
        }
        signOut={
          <div className="flex items-center">
            <PushToggle publicKey={vapidPublicKey()} />
            <form action={signOutAction}>
              <button
                type="submit"
                title="Abmelden"
                aria-label="Abmelden"
                className="rounded-lg p-2 text-ink-soft hover:bg-muted hover:text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
                </svg>
              </button>
            </form>
          </div>
        }
      />
      <div className="lg:pl-60 print:pl-0">
        <main className="mx-auto max-w-6xl px-4 py-6 pb-16 sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
