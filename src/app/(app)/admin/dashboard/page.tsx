import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ColumnChart, FunnelChart } from "@/components/charts";
import {
  Button,
  ButtonLink,
  Card,
  CardTitle,
  cn,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE, formatDate } from "@/lib/format";
import { formatEuro } from "@/lib/outcomes/money";
import { loadConsultationStats } from "@/lib/reports/consultations";
import { loadReport } from "@/lib/reports/load";
import { ConsultationAnalysis } from "./consultation-analysis";
import { rate, type Metrics } from "@/lib/reports/report";
import { addDays, isLocalDate, localDateOf, startOfLocalDay } from "@/lib/time";

export const metadata: Metadata = { title: "Auswertung" };

const pct = (v: number | null) =>
  v === null
    ? "–"
    : new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 }).format(v);

function presets(today: string) {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${y}-${pad(m)}-01`;
  const prevMonth = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
  const quarterStart = `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`;
  return [
    { label: "30 Tage", from: addDays(today, -29), to: today },
    { label: "Dieser Monat", from: monthStart, to: today },
    { label: "Letzter Monat", from: prevMonth, to: addDays(monthStart, -1) },
    { label: "Quartal", from: quarterStart, to: today },
    { label: "Dieses Jahr", from: `${y}-01-01`, to: today },
  ];
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-4",
        tone === "warn" && "border-amber-300 dark:border-amber-800",
      )}
    >
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}

function MetricsTable({
  rows,
  first,
  showLeads,
}: {
  rows: Array<{ key: string; label: ReactNode; metrics: Metrics }>;
  first: string;
  showLeads: boolean;
}) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
            <th className="px-4 py-2 font-medium sm:pl-0">{first}</th>
            {showLeads && <th className="px-2 py-2 text-right font-medium">Leads</th>}
            <th className="px-2 py-2 text-right font-medium">Beratung gebucht</th>
            <th className="px-2 py-2 text-right font-medium">Stattgefunden</th>
            <th className="px-2 py-2 text-right font-medium">No-Show</th>
            <th className="px-2 py-2 text-right font-medium">Abschlüsse</th>
            <th
              className="px-2 py-2 text-right font-medium"
              title="Abschlüsse je stattgefundene Beratung"
            >
              Abschlussquote
            </th>
            <th className="px-4 py-2 text-right font-medium sm:pr-0">Umsatz</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(({ key, label, metrics: m }) => (
            <tr key={key}>
              <td className="px-4 py-2 sm:pl-0">{label}</td>
              {showLeads && <td className="px-2 py-2 text-right tabular-nums">{m.leads}</td>}
              <td className="px-2 py-2 text-right tabular-nums">{m.booked}</td>
              <td className="px-2 py-2 text-right tabular-nums">{m.held}</td>
              <td className="px-2 py-2 text-right tabular-nums">{m.noShow}</td>
              <td className="px-2 py-2 text-right tabular-nums">{m.won}</td>
              <td className="px-2 py-2 text-right tabular-nums">{pct(rate(m.won, m.held))}</td>
              <td className="px-4 py-2 text-right font-medium tabular-nums sm:pr-0">
                {formatEuro(m.revenueCents, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/admin/dashboard">) {
  await requireAdmin();
  const params = await searchParams;
  const now = new Date();
  const today = localDateOf(now, APP_TIMEZONE);
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  let from = isLocalDate(str("from")) ? str("from") : addDays(today, -29);
  let to = isLocalDate(str("to")) ? str("to") : today;
  if (from > to) [from, to] = [to, from];
  const campaign = str("campaign") || null;
  const tattooerId = str("tattooer") || null;

  const [report, consultationStats, campaigns, tattooers] = await Promise.all([
    loadReport(prisma, { from, to, campaign, tattooerId, now, timeZone: APP_TIMEZONE }),
    loadConsultationStats(prisma, { from, to, campaign, tattooerId, now, timeZone: APP_TIMEZONE }),
    prisma.lead.groupBy({
      by: ["metaCampaignId", "metaCampaignName"],
      where: { metaCampaignId: { not: null } },
      orderBy: { metaCampaignName: "asc" },
    }),
    prisma.tattooerProfile.findMany({
      select: { id: true, user: { select: { name: true, active: true } } },
    }),
  ]);
  const tattooerName = new Map(tattooers.map((t) => [t.id, t.user.name]));

  const t = report.totals;
  const qs = (over: Record<string, string>) =>
    `/admin/dashboard?${new URLSearchParams({
      from,
      to,
      ...(campaign ? { campaign } : {}),
      ...(tattooerId ? { tattooer: tattooerId } : {}),
      ...over,
    })}`;

  return (
    <>
      <PageHeader
        title="Auswertung"
        description={`Leads mit Eingang ${formatDate(startOfLocalDay(from, APP_TIMEZONE))} – ${formatDate(startOfLocalDay(to, APP_TIMEZONE))} und was daraus wurde (auch wenn Beratung oder Tattoo später stattfinden).`}
      />

      <div className="mb-3 flex flex-wrap gap-1">
        {presets(today).map((p) => (
          <Link
            key={p.label}
            href={qs({ from: p.from, to: p.to })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              p.from === from && p.to === to
                ? "bg-ink text-paper"
                : "text-ink-soft hover:bg-muted hover:text-ink",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form className="mb-5 grid gap-2 sm:grid-cols-[auto_auto_1fr_1fr_auto]">
        <Input type="date" name="from" defaultValue={from} aria-label="Von" />
        <Input type="date" name="to" defaultValue={to} aria-label="Bis" />
        <Select name="campaign" defaultValue={campaign ?? ""} aria-label="Kampagne">
          <option value="">Alle Kampagnen</option>
          {campaigns.map((c) => (
            <option key={c.metaCampaignId} value={c.metaCampaignId!}>
              {c.metaCampaignName ?? c.metaCampaignId}
            </option>
          ))}
          <option value="none">Ohne Kampagne</option>
        </Select>
        <Select name="tattooer" defaultValue={tattooerId ?? ""} aria-label="Tätowierer">
          <option value="">Alle Tätowierer</option>
          {tattooers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.user.name}
              {x.user.active ? "" : " (inaktiv)"}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button type="submit">Anzeigen</Button>
          {(campaign || tattooerId) && (
            <ButtonLink href={`/admin/dashboard?from=${from}&to=${to}`} variant="ghost">
              Filter zurücksetzen
            </ButtonLink>
          )}
        </div>
      </form>

      {tattooerId && (
        <p className="mb-4 text-sm text-ink-soft">
          Gefiltert nach {tattooerName.get(tattooerId)}: Es zählen nur Leads mit Beratung oder
          Tattoo bei dieser Person – und davon nur ihr eigener Teil (Termine, Abschlüsse, Umsatz).
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Leads"
          value={t.leads}
          sub={tattooerId ? "mit Beratung bei dieser Person" : undefined}
        />
        <Tile
          label="Beratung gebucht"
          value={t.booked}
          sub={`${pct(rate(t.booked, t.leads))} der Leads`}
        />
        <Tile
          label="Tattoo-Abschlüsse"
          value={t.won}
          sub={`${pct(rate(t.won, t.held))} der stattgefundenen Beratungen`}
        />
        <Tile
          label="Umsatz"
          value={formatEuro(t.revenueCents, true)}
          sub={`davon bereits gestochen: ${formatEuro(t.revenueRealizedCents, true)}`}
        />
        <Tile
          label="Umsatz pro Lead"
          value={t.leads ? formatEuro(Math.round(t.revenueCents / t.leads), true) : "–"}
        />
        <Tile
          label="Umsatz pro Abschluss"
          value={t.won ? formatEuro(Math.round(t.revenueCents / t.won), true) : "–"}
        />
        <Tile
          label="Tattoo-Termine"
          value={t.sessions}
          sub="vergebene Sitzungen (ohne abgesagte)"
        />
        <Tile
          label="Offene Punkte"
          value={t.open + t.missingAmounts}
          sub={`${t.open} Ergebnisse fehlen · ${t.missingAmounts} Beträge fehlen`}
          tone={t.open + t.missingAmounts > 0 ? "warn" : undefined}
        />
      </div>
      {t.open > 0 && (
        <p className="mb-4 text-sm">
          <Link href="/consultations" className="font-medium underline underline-offset-2">
            {t.open} Beratung{t.open === 1 ? "" : "en"} ohne Ergebnis
          </Link>{" "}
          – die Zahlen sind erst vollständig, wenn alle Ergebnisse eingetragen sind.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Vom Lead zum Tattoo</CardTitle>
          <FunnelChart
            steps={[
              { label: "Leads", value: t.leads },
              { label: "Beratung gebucht", value: t.booked, note: pct(rate(t.booked, t.leads)) },
              { label: "Beratung stattgefunden", value: t.held, note: pct(rate(t.held, t.booked)) },
              { label: "Tattoo gebucht", value: t.won, note: pct(rate(t.won, t.held)) },
            ]}
          />
          <p className="mt-3 text-xs text-ink-soft">
            Prozent = Anteil der vorherigen Stufe. No-Shows: {t.noShow} (
            {pct(rate(t.noShow, t.booked))} der gebuchten).
          </p>
        </Card>
        <Card className="space-y-6">
          <ColumnChart
            title={`Leads pro ${report.granularity === "week" ? "Woche" : "Monat"}`}
            data={report.series.map((s) => ({
              key: s.key,
              label: s.label,
              tooltip: report.granularity === "week" ? `Woche ab ${s.label}` : s.label,
              value: s.metrics.leads,
            }))}
            format={(v) => String(v)}
          />
          <ColumnChart
            title={`Umsatz nach ${report.granularity === "week" ? "Lead-Woche" : "Lead-Monat"}`}
            data={report.series.map((s) => ({
              key: s.key,
              label: s.label,
              tooltip: report.granularity === "week" ? `Woche ab ${s.label}` : s.label,
              value: s.metrics.revenueCents,
            }))}
            format={(v) => formatEuro(v, true)}
          />
        </Card>

        <ConsultationAnalysis
          totals={consultationStats.totals}
          byTattooer={consultationStats.byTattooer.map((r) => ({
            ...r,
            label: tattooerName.get(r.key) ?? "Unbekannt",
          }))}
          byMode={consultationStats.byMode.map((r) => ({
            ...r,
            label: r.key === "PHONE" ? "Telefon" : "Vor Ort",
          }))}
        />

        <Card className="lg:col-span-2">
          <CardTitle>Nach Kampagne</CardTitle>
          {report.byCampaign.length === 0 ? (
            <p className="text-sm text-ink-soft">Keine Leads im Zeitraum.</p>
          ) : (
            <MetricsTable
              first="Kampagne"
              showLeads
              rows={report.byCampaign.map((c) => ({
                key: c.key,
                label: (
                  <span>
                    {c.label}
                    <span className="block text-xs text-ink-soft">
                      Umsatz pro Lead:{" "}
                      {c.metrics.leads
                        ? formatEuro(Math.round(c.metrics.revenueCents / c.metrics.leads), true)
                        : "–"}
                    </span>
                  </span>
                ),
                metrics: c.metrics,
              }))}
            />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Nach Tätowierer</CardTitle>
          {report.byTattooer.length === 0 ? (
            <p className="text-sm text-ink-soft">Noch keine Beratungen zu diesen Leads.</p>
          ) : (
            <MetricsTable
              first="Tätowierer"
              showLeads={false}
              rows={report.byTattooer.map((x) => ({
                key: x.key,
                label: tattooerName.get(x.key) ?? "Unbekannt",
                metrics: x.metrics,
              }))}
            />
          )}
        </Card>
      </div>
    </>
  );
}
