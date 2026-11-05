import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import {
  billingConfigFromEnv,
  isMonth,
  issuerComplete,
  loadMonthRevenue,
  monthLabel,
  monthOf,
  monthRange,
  shiftMonth,
  computeAmounts,
} from "@/lib/billing/billing";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE, formatDate } from "@/lib/format";
import { formatEuro } from "@/lib/outcomes/money";
import { INVOICE_STATUS } from "@/lib/billing/labels";
import { ActionButton } from "./buttons";
import { cancelInvoiceAction, createInvoiceAction, setPaidAction } from "./actions";

export const metadata: Metadata = { title: "Abrechnung" };

const pct = (bps: number) => `${(bps / 100).toLocaleString("de-DE")} %`;

const dayFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

export default async function BillingPage({ searchParams }: PageProps<"/admin/billing">) {
  await requireAdmin();
  const params = await searchParams;
  const now = new Date();
  const current = monthOf(now, APP_TIMEZONE);
  const month = typeof params.monat === "string" && isMonth(params.monat) ? params.monat : current;
  const cfg = billingConfigFromEnv();
  const [revenue, invoices] = await Promise.all([
    loadMonthRevenue(prisma, month, APP_TIMEZONE),
    prisma.invoice.findMany({ orderBy: [{ period: "desc" }, { number: "desc" }], take: 60 }),
  ]);
  const amounts = computeAmounts(revenue.revenueCents, cfg);
  const finished = monthRange(month, APP_TIMEZONE).end <= now;
  const invoice = invoices.find((i) => i.period === month && i.status !== "CANCELLED");
  const drift = invoice ? revenue.revenueCents - invoice.revenueCents : 0;

  return (
    <>
      <PageHeader
        title="Abrechnung"
        description={`Über NEEDL umgesetzter Tattoo-Umsatz pro Monat und die Provisionsrechnungen (${pct(cfg.commissionBps)}).`}
      />

      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`/admin/billing?monat=${shiftMonth(month, -1)}`}
          aria-label="Vormonat"
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-muted"
        >
          ←
        </Link>
        <span className="min-w-36 text-center font-medium">{monthLabel(month)}</span>
        <Link
          href={`/admin/billing?monat=${shiftMonth(month, 1)}`}
          aria-label="Nächster Monat"
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-muted"
        >
          →
        </Link>
        {month !== current && (
          <Link href="/admin/billing" className="ml-1 text-sm text-ink-soft underline">
            Aktueller Monat
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle
            action={
              finished ? (
                <Badge tone="gray">abgeschlossen</Badge>
              ) : (
                <Badge tone="blue">läuft noch</Badge>
              )
            }
          >
            Umsatz {monthLabel(month)}
          </CardTitle>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-ink-soft">Tattoo-Umsatz</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {formatEuro(revenue.revenueCents)}
              </dd>
              <dd className="text-xs text-ink-soft">{revenue.sessionCount} Tattoo-Termine</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-ink-soft">Provision {pct(cfg.commissionBps)}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {formatEuro(amounts.netCents)}
              </dd>
              <dd className="text-xs text-ink-soft">netto</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-ink-soft">
                Rechnungsbetrag{cfg.vatBps ? ` inkl. ${pct(cfg.vatBps)} USt.` : ""}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {formatEuro(amounts.grossCents)}
              </dd>
              <dd className="text-xs text-ink-soft">
                {cfg.vatBps ? `USt. ${formatEuro(amounts.vatCents)}` : "ohne USt. (§ 19 UStG)"}
              </dd>
            </div>
          </dl>
          {revenue.missingAmounts > 0 && (
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Bei {revenue.missingAmounts} Tattoo-Termin(en) fehlt noch der Betrag – sie zählen
              erst, wenn er eingetragen ist.
            </p>
          )}
          {!finished && (
            <p className="mt-3 text-xs text-ink-soft">
              Der Monat läuft noch: Termine bis Monatsende zählen mit, sobald ihr Betrag eingetragen
              ist.
            </p>
          )}

          {revenue.byTattooer.length > 0 && (
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 font-medium">Tätowierer</th>
                  <th className="py-2 text-right font-medium">Termine</th>
                  <th className="py-2 text-right font-medium">Umsatz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {revenue.byTattooer.map((t) => (
                  <tr key={t.name}>
                    <td className="py-2">{t.name}</td>
                    <td className="py-2 text-right tabular-nums">{t.sessions}</td>
                    <td className="py-2 text-right tabular-nums">{formatEuro(t.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {revenue.lines.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-ink-soft hover:text-ink">
                Alle {revenue.lines.length} Tattoo-Termine anzeigen
              </summary>
              <ul className="mt-2 divide-y divide-line">
                {revenue.lines.map((l) => (
                  <li key={l.sessionId} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                    <span>
                      <span className="tabular-nums text-ink-soft">
                        {dayFmt.format(new Date(`${l.date}T12:00:00Z`))}
                      </span>{" "}
                      {l.leadName}
                      <span className="text-ink-soft">
                        {" "}
                        · {l.tattooerName}
                        {l.walkIn && " · Laufkunde"}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {l.amountCents === null ? (
                        <span className="text-amber-700">Betrag fehlt</span>
                      ) : (
                        formatEuro(l.amountCents)
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        <Card>
          <CardTitle>Rechnung {monthLabel(month)}</CardTitle>
          {invoice ? (
            <div className="space-y-3 text-sm">
              <p>
                <Link href={`/admin/billing/${invoice.id}`} className="font-medium underline">
                  Rechnung {invoice.number}
                </Link>{" "}
                <Badge tone={INVOICE_STATUS[invoice.status].tone}>
                  {INVOICE_STATUS[invoice.status].label}
                </Badge>
              </p>
              <p className="text-ink-soft">
                {formatEuro(invoice.grossCents)} · erstellt am {formatDate(invoice.issuedAt)}
              </p>
              {drift !== 0 && (
                <p className="rounded-lg bg-amber-50 p-2 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Der Umsatz hat sich seit der Rechnung um {formatEuro(drift)} geändert. Bei Bedarf
                  stornieren und neu erstellen.
                </p>
              )}
            </div>
          ) : !finished ? (
            <p className="text-sm text-ink-soft">
              Die Rechnung kann erstellt werden, sobald der Monat vorbei ist.
            </p>
          ) : !issuerComplete(cfg) ? (
            <p className="text-sm text-ink-soft">
              Für Rechnungen fehlen noch die Rechnungsdaten des Betreibers (Server-Einstellungen{" "}
              <code className="text-xs">BILLING_ISSUER_*</code>).
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-ink-soft">
                Provision {pct(cfg.commissionBps)} auf {formatEuro(revenue.revenueCents)} ={" "}
                <span className="font-medium text-ink">{formatEuro(amounts.grossCents)}</span>
                {cfg.vatBps ? " inkl. USt." : ""}
              </p>
              <ActionButton
                variant="primary"
                action={createInvoiceAction.bind(null, month)}
                confirm={`Rechnung für ${monthLabel(month)} über ${formatEuro(amounts.grossCents)} erstellen?`}
              >
                Rechnung erstellen
              </ActionButton>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle>Rechnungsübersicht</CardTitle>
        {invoices.length === 0 ? (
          <p className="py-4 text-sm text-ink-soft">Noch keine Rechnungen.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-4 py-2 font-medium sm:pl-0">Nr.</th>
                  <th className="px-2 py-2 font-medium">Monat</th>
                  <th className="px-2 py-2 text-right font-medium">Umsatz</th>
                  <th className="px-2 py-2 text-right font-medium">Betrag</th>
                  <th className="px-2 py-2 font-medium">Fällig</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 sm:pr-0" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((inv) => (
                  <tr key={inv.id} className={inv.status === "CANCELLED" ? "text-ink-soft" : ""}>
                    <td className="px-4 py-2 sm:pl-0">
                      <Link href={`/admin/billing/${inv.id}`} className="font-medium underline">
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{monthLabel(inv.period)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatEuro(inv.revenueCents)}
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">
                      {formatEuro(inv.grossCents)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{formatDate(inv.dueAt)}</td>
                    <td className="px-2 py-2">
                      <Badge tone={INVOICE_STATUS[inv.status].tone}>
                        {INVOICE_STATUS[inv.status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right sm:pr-0">
                      {inv.status === "OPEN" && (
                        <span className="inline-flex gap-1">
                          <ActionButton action={setPaidAction.bind(null, inv.id, true)}>
                            Bezahlt
                          </ActionButton>
                          <ActionButton
                            variant="danger"
                            action={cancelInvoiceAction.bind(null, inv.id)}
                            confirm={`Rechnung ${inv.number} stornieren?`}
                          >
                            Stornieren
                          </ActionButton>
                        </span>
                      )}
                      {inv.status === "PAID" && (
                        <ActionButton action={setPaidAction.bind(null, inv.id, false)}>
                          Wieder offen
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
