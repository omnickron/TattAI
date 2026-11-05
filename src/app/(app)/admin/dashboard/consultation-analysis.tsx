import { Card, CardTitle } from "@/components/ui";
import type { ConsultationStats } from "@/lib/reports/consultations";

const pct = (v: number | null) =>
  v === null
    ? "–"
    : new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 }).format(v);

const SEGMENTS = [
  { key: "held", label: "Stattgefunden", color: "bg-emerald-500" },
  { key: "noShow", label: "No-Show", color: "bg-red-500" },
  { key: "cancelled", label: "Abgesagt", color: "bg-amber-400" },
  { key: "open", label: "Ergebnis fehlt", color: "bg-zinc-400" },
  { key: "upcoming", label: "Anstehend", color: "bg-zinc-200 dark:bg-zinc-700" },
] as const;

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-xs text-ink-soft">
        <span className={`size-2 rounded-full ${tone}`} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>
    </div>
  );
}

function Table({
  first,
  rows,
}: {
  first: string;
  rows: Array<{ key: string; label: string; stats: ConsultationStats }>;
}) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[38rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
            <th className="px-4 py-2 font-medium sm:pl-0">{first}</th>
            <th className="px-2 py-2 text-right font-medium">Beratungen</th>
            <th className="px-2 py-2 text-right font-medium">Stattgefunden</th>
            <th className="px-2 py-2 text-right font-medium">No-Show</th>
            <th className="px-2 py-2 text-right font-medium">Abgesagt</th>
            <th className="px-2 py-2 text-right font-medium" title="anstehend + ohne Ergebnis">
              Offen
            </th>
            <th className="px-2 py-2 text-right font-medium">No-Show-Quote</th>
            <th className="px-4 py-2 text-right font-medium sm:pr-0">Absage-Quote</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(({ key, label, stats: s }) => (
            <tr key={key}>
              <td className="px-4 py-2 sm:pl-0">{label}</td>
              <td className="px-2 py-2 text-right tabular-nums">{s.total}</td>
              <td className="px-2 py-2 text-right tabular-nums">{s.held}</td>
              <td className="px-2 py-2 text-right tabular-nums">{s.noShow}</td>
              <td className="px-2 py-2 text-right tabular-nums">{s.cancelled}</td>
              <td className="px-2 py-2 text-right tabular-nums">{s.open + s.upcoming}</td>
              <td className="px-2 py-2 text-right tabular-nums">{pct(s.noShowRate)}</td>
              <td className="px-4 py-2 text-right tabular-nums sm:pr-0">{pct(s.cancelRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Consultations of the period by consultation date: held, no-show, cancelled. */
export function ConsultationAnalysis({
  totals: t,
  byMode,
}: {
  totals: ConsultationStats;
  byMode: Array<{ key: string; label: string; stats: ConsultationStats }>;
}) {
  return (
    <Card className="lg:col-span-2">
      <CardTitle>Beratungen: stattgefunden, abgesagt, No-Show</CardTitle>
      <p className="-mt-1 mb-4 text-sm text-ink-soft">
        Alle Beratungen mit Termin im gewählten Zeitraum (nach Beratungsdatum, spätere Termine
        zählen nicht). „Offen“ = anstehend + ohne Ergebnis. Quoten beziehen sich auf die bereits
        entschiedenen Beratungen; Umbuchungen zählen nicht als Absage.
      </p>
      {t.total === 0 ? (
        <p className="py-4 text-sm text-ink-soft">Keine Beratungen im Zeitraum.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Stattgefunden"
              value={t.held}
              sub={`${pct(t.heldRate)} der entschiedenen`}
              tone="bg-emerald-500"
            />
            <Tile
              label="No-Show"
              value={t.noShow}
              sub={`${pct(t.noShowRate)} der entschiedenen`}
              tone="bg-red-500"
            />
            <Tile
              label="Abgesagt"
              value={t.cancelled}
              sub={`${pct(t.cancelRate)} · davon ${t.cancelledShortNotice} kurzfristig (< 24 h)`}
              tone="bg-amber-400"
            />
            <Tile
              label="Noch offen"
              value={t.open + t.upcoming}
              sub={`${t.upcoming} anstehend · ${t.open} ohne Ergebnis`}
              tone="bg-zinc-400"
            />
          </div>

          <div>
            <div
              className="flex h-3 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label="Verteilung der Beratungen"
            >
              {SEGMENTS.map((seg) => {
                const v = t[seg.key];
                return v ? (
                  <div
                    key={seg.key}
                    className={seg.color}
                    style={{ width: `${(v / t.total) * 100}%` }}
                    title={`${seg.label}: ${v}`}
                  />
                ) : null;
              })}
            </div>
          </div>

          {byMode.length > 1 && <Table first="Beratungsform" rows={byMode} />}
        </div>
      )}
    </Card>
  );
}
