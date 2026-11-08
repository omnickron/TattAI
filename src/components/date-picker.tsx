"use client";

import { useState } from "react";
import { cn } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const monthName = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function todayIso() {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Inline month calendar to pick one day. Submits "YYYY-MM-DD" under `name`.
 * Days before `min` are disabled.
 */
export function DatePicker({
  name,
  value,
  onChange,
  min,
  label = "Datum wählen",
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  label?: string;
}) {
  const start = value || min || todayIso();
  const [view, setView] = useState(() => {
    const [y, m] = start.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const today = todayIso();
  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const move = (delta: number) =>
    setView(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const canGoBack = !min || iso(view.y, view.m, 1) > min.slice(0, 8) + "01";

  return (
    <div className="w-full max-w-xs rounded-lg border border-line bg-surface p-2">
      <input type="hidden" name={name} value={value} />
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={!canGoBack}
          aria-label="Vorheriger Monat"
          className="rounded-md px-2 py-1 text-ink-soft hover:bg-muted disabled:opacity-30"
        >
          ‹
        </button>
        <span className="text-sm font-medium">{monthName.format(first)}</span>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Nächster Monat"
          className="rounded-md px-2 py-1 text-ink-soft hover:bg-muted"
        >
          ›
        </button>
      </div>
      <div role="grid" aria-label={label} className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-[11px] text-ink-soft">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const date = iso(view.y, view.m, d);
          const disabled = Boolean(min && date < min);
          const selected = date === value;
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={dayLabel.format(new Date(`${date}T12:00:00Z`))}
              onClick={() => onChange(date)}
              className={cn(
                "h-8 rounded-md text-sm tabular-nums",
                selected
                  ? "bg-ink font-semibold text-paper"
                  : disabled
                    ? "text-ink-soft/40"
                    : "hover:bg-muted",
                date === today && !selected && "font-semibold underline underline-offset-2",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-xs text-ink-soft">
        {value ? dayLabel.format(new Date(`${value}T12:00:00Z`)) : "Bitte einen Tag wählen"}
      </p>
    </div>
  );
}
