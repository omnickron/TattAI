/**
 * Minimal server-rendered charts (HTML/CSS, no library): one series per chart,
 * thin bars with rounded data ends, recessive grid, hover tooltip per bar.
 */

export function ColumnChart({
  title,
  data,
  format,
  emptyLabel = "Keine Daten im Zeitraum",
}: {
  title: string;
  /** label = axis label; tooltip = longer label on hover (defaults to label) */
  data: Array<{ key: string; label: string; tooltip?: string; value: number }>;
  format: (v: number) => string;
  emptyLabel?: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const every = Math.max(1, Math.ceil(data.length / 8)); // at most ~8 axis labels
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      {max === 0 ? (
        <p className="flex h-40 items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-soft">
          {emptyLabel}
        </p>
      ) : (
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-40 border-y border-line/70"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-20 border-t border-dashed border-line/70"
            aria-hidden
          />
          <span className="absolute -top-2 right-0 bg-surface pl-1 text-[11px] text-ink-soft">
            {format(max)}
          </span>
          <ol className="relative flex h-40 items-end gap-[2px]" aria-label={title}>
            {data.map((d) => (
              <li
                key={d.key}
                className="group relative flex h-full flex-1 items-end justify-center"
              >
                {/* hit target spans the whole column height */}
                <span
                  className="block w-full max-w-7 rounded-t-[4px] bg-chart-1 transition-opacity group-hover:opacity-80"
                  style={{ height: d.value > 0 ? `max(2px, ${(d.value / max) * 100}%)` : 0 }}
                />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-paper shadow group-hover:block"
                >
                  {d.tooltip ?? d.label}:{" "}
                  <span className="font-semibold tabular-nums">{format(d.value)}</span>
                </span>
                <span className="sr-only">
                  {d.tooltip ?? d.label}: {format(d.value)}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-1 flex gap-[2px]" aria-hidden>
            {data.map((d, i) => (
              <span key={d.key} className="flex-1 truncate text-center text-[10px] text-ink-soft">
                {i % every === 0 ? d.label : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}

/** Funnel as horizontal bars, values and conversion directly labelled. */
export function FunnelChart({
  steps,
}: {
  steps: Array<{ label: string; value: number; note?: string }>;
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-2.5" aria-label="Trichter">
      {steps.map((s) => (
        <li
          key={s.label}
          className="group grid grid-cols-[9rem_1fr] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr]"
        >
          <span className="text-ink-soft">{s.label}</span>
          <div
            className="flex items-center gap-2"
            title={`${s.label}: ${s.value}${s.note ? ` (${s.note})` : ""}`}
          >
            <span
              className="block h-3 rounded-r-[4px] bg-chart-1 transition-opacity group-hover:opacity-80"
              style={{ width: s.value > 0 ? `max(2px, ${(s.value / max) * 85}%)` : 0 }}
            />
            <span className="whitespace-nowrap tabular-nums">
              <span className="font-semibold">{s.value}</span>
              {s.note && <span className="text-xs text-ink-soft"> · {s.note}</span>}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
