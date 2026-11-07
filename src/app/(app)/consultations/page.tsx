import type { Metadata } from "next";
import Link from "next/link";
import { OutcomePanel } from "@/components/outcome-panel";
import { Badge, Card, cn, EmptyState, PageHeader } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { CONSULTATION_MODE_LABELS } from "@/lib/scheduling/event-content";

export const metadata: Metadata = { title: "Beratungen" };

const TABS = {
  open: "Ergebnis fehlt",
  upcoming: "Anstehend",
  done: "Erledigt",
} as const;
type Tab = keyof typeof TABS;

export default async function ConsultationsPage({ searchParams }: PageProps<"/consultations">) {
  const user = await requireUser();
  const params = await searchParams;
  const tab: Tab = params.tab === "upcoming" || params.tab === "done" ? params.tab : "open";
  const now = new Date();
  const isAdmin = user.role === "ADMIN";
  const scope: Prisma.ConsultationWhereInput = isAdmin
    ? { lead: { isTest: false } }
    : { lead: { isTest: false }, tattooerId: user.tattooerProfile?.id ?? "__none__" };

  const where: Record<Tab, Prisma.ConsultationWhereInput> = {
    // Ended consultations still waiting for their outcome
    open: { ...scope, status: "SCHEDULED", endsAt: { lte: now } },
    upcoming: { ...scope, status: "SCHEDULED", endsAt: { gt: now } },
    done: {
      ...scope,
      walkIn: false,
      OR: [
        { status: { in: ["HELD", "NO_SHOW"] } },
        { status: "CANCELLED", outcomeRecordedAt: { not: null } },
      ],
    },
  };
  const [items, openCount] = await Promise.all([
    prisma.consultation.findMany({
      where: where[tab],
      orderBy: { startsAt: tab === "upcoming" ? "asc" : "desc" },
      take: 100,
      include: {
        lead: { select: { id: true, name: true, phoneE164: true } },
        tattooer: { include: { user: { select: { name: true } } } },
        tattooBookings: true,
      },
    }),
    prisma.consultation.count({ where: where.open }),
  ]);

  return (
    <>
      <PageHeader
        title="Beratungen"
        description={
          isAdmin
            ? "Alle Beratungstermine und ihre Ergebnisse"
            : "Deine Beratungstermine und ihre Ergebnisse"
        }
      />
      {typeof params.saved === "string" && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Ergebnis gespeichert.{tab === "open" && openCount > 0 && ` Noch ${openCount} offen.`}
        </p>
      )}
      <nav className="mb-4 flex gap-1 overflow-x-auto" aria-label="Ansicht">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={t === "open" ? "/consultations" : `/consultations?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
              tab === t ? "bg-ink text-paper" : "text-ink-soft hover:bg-muted hover:text-ink",
            )}
          >
            {TABS[t]}
            {t === "open" && openCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-xs text-white">
                {openCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState>
          {tab === "open"
            ? "Alle Ergebnisse sind eingetragen. 👍"
            : tab === "upcoming"
              ? "Keine anstehenden Beratungen."
              : "Noch keine Ergebnisse."}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <Card key={c.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium tabular-nums">{formatDateTime(c.startsAt)}</span>
                <Link
                  href={`/leads/${c.lead.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {c.lead.name}
                </Link>
                <Badge tone={c.mode === "PHONE" ? "violet" : "gray"}>
                  {CONSULTATION_MODE_LABELS[c.mode]}
                </Badge>
                {c.mode === "PHONE" && c.lead.phoneE164 && (
                  <a
                    href={`tel:${c.lead.phoneE164}`}
                    className="text-sm tabular-nums underline underline-offset-2"
                  >
                    {c.lead.phoneE164}
                  </a>
                )}
                {isAdmin && (
                  <span className="ml-auto text-sm text-ink-soft">{c.tattooer.user.name}</span>
                )}
              </div>
              {tab !== "upcoming" && (
                <OutcomePanel
                  c={c}
                  now={now}
                  returnTo={tab === "open" ? "/consultations" : "/consultations?tab=done"}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
