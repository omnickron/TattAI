import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { monthLabel, type BillingLine } from "@/lib/billing/billing";
import { INVOICE_STATUS } from "@/lib/billing/labels";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatEuro } from "@/lib/outcomes/money";
import { logoFont } from "../../../../fonts";
import { PrintButton } from "../buttons";

export const metadata: Metadata = { title: "Rechnung" };

type Party = { name?: string; address?: string; taxId?: string; iban?: string; email?: string };

const pct = (bps: number) => `${(bps / 100).toLocaleString("de-DE")} %`;
const dayFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
/** Customers only as initials on the invoice (data minimisation). */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(" ");

function Lines({ text }: { text?: string }) {
  return (
    <>
      {(text ?? "")
        .split(/\n|,\s*/)
        .filter(Boolean)
        .map((l) => (
          <span key={l} className="block">
            {l}
          </span>
        ))}
    </>
  );
}

export default async function InvoicePage({ params }: PageProps<"/admin/billing/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) notFound();
  const issuer = inv.issuer as Party;
  const recipient = inv.recipient as Party;
  const lines = (inv.lines as unknown as BillingLine[]) ?? [];
  const status = INVOICE_STATUS[inv.status];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/admin/billing?monat=${inv.period}`}
          className="text-sm text-ink-soft hover:text-ink"
        >
          ← Abrechnung {monthLabel(inv.period)}
        </Link>
        <div className="flex items-center gap-3">
          <Badge tone={status.tone}>{status.label}</Badge>
          <PrintButton />
        </div>
      </div>

      <article className="relative mx-auto max-w-[800px] rounded-xl border border-line bg-white p-8 text-[13px] leading-relaxed text-zinc-900 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {inv.status === "CANCELLED" && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-7xl font-bold uppercase tracking-widest text-red-600/15 -rotate-12">
            Storniert
          </p>
        )}
        <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
          <div className={`${logoFont.className} text-2xl tracking-wide`}>NEEDL</div>
          <div className="text-right text-xs text-zinc-600">
            <span className="block font-medium text-zinc-900">{issuer.name}</span>
            <Lines text={issuer.address} />
            {issuer.email && <span className="block">{issuer.email}</span>}
          </div>
        </header>

        <div className="mb-10 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] text-zinc-500">
              {issuer.name} · {(issuer.address ?? "").replace(/\n/g, " · ")}
            </p>
            <span className="block font-medium">{recipient.name || "Studio"}</span>
            <Lines text={recipient.address} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 self-end text-right sm:justify-self-end">
            <dt className="text-zinc-500">Rechnungsnummer</dt>
            <dd className="font-medium">{inv.number}</dd>
            <dt className="text-zinc-500">Rechnungsdatum</dt>
            <dd>{formatDate(inv.issuedAt)}</dd>
            <dt className="text-zinc-500">Leistungszeitraum</dt>
            <dd>{monthLabel(inv.period)}</dd>
            {issuer.taxId && (
              <>
                <dt className="text-zinc-500">Steuernummer</dt>
                <dd>{issuer.taxId}</dd>
              </>
            )}
          </dl>
        </div>

        <h1 className="mb-6 text-2xl">Rechnung {inv.number}</h1>

        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-300 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="py-2 font-medium">Leistung</th>
              <th className="py-2 text-right font-medium">Betrag</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-200 align-top">
              <td className="py-3 pr-4">
                Provision {pct(inv.commissionBps)} auf den über NEEDL gebuchten Tattoo-Umsatz im{" "}
                {monthLabel(inv.period)}
                <span className="block text-zinc-500">
                  Bemessungsgrundlage {formatEuro(inv.revenueCents)} aus {inv.sessionCount}{" "}
                  Tattoo-Terminen (siehe Anlage)
                </span>
              </td>
              <td className="py-3 text-right tabular-nums">{formatEuro(inv.netCents)}</td>
            </tr>
          </tbody>
          <tfoot className="tabular-nums">
            <tr>
              <td className="pt-3 text-right text-zinc-500">Nettobetrag</td>
              <td className="pt-3 text-right">{formatEuro(inv.netCents)}</td>
            </tr>
            {inv.vatBps > 0 && (
              <tr>
                <td className="text-right text-zinc-500">zzgl. {pct(inv.vatBps)} USt.</td>
                <td className="text-right">{formatEuro(inv.vatCents)}</td>
              </tr>
            )}
            <tr className="text-base font-semibold">
              <td className="pt-2 text-right">Rechnungsbetrag</td>
              <td className="pt-2 text-right">{formatEuro(inv.grossCents)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-8 space-y-1 text-zinc-700">
          {inv.vatBps === 0 && <p>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</p>}
          <p>
            Bitte überweise den Betrag bis zum{" "}
            <span className="font-medium">{formatDate(inv.dueAt)}</span>
            {issuer.iban ? (
              <>
                {" "}
                auf das Konto <span className="font-medium">{issuer.iban}</span>
              </>
            ) : null}{" "}
            unter Angabe der Rechnungsnummer {inv.number}.
          </p>
          {inv.status === "PAID" && inv.paidAt && (
            <p className="font-medium text-emerald-700">Bezahlt am {formatDate(inv.paidAt)}.</p>
          )}
        </div>

        {lines.length > 0 && (
          <section className="mt-12 break-before-page">
            <h2 className="mb-3 text-base">Anlage: Tattoo-Termine {monthLabel(inv.period)}</h2>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="py-1.5 font-medium">Datum</th>
                  <th className="py-1.5 font-medium">Kunde</th>
                  <th className="py-1.5 font-medium">Tätowierer</th>
                  <th className="py-1.5 text-right font-medium">Umsatz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {lines.map((l) => (
                  <tr key={l.sessionId}>
                    <td className="py-1.5 tabular-nums">
                      {dayFmt.format(new Date(`${l.date}T12:00:00Z`))}
                    </td>
                    <td className="py-1.5">{initials(l.leadName)}</td>
                    <td className="py-1.5">{l.tattooerName}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {l.amountCents === null ? "–" : formatEuro(l.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </article>
    </>
  );
}
