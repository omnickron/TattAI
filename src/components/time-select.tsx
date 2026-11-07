"use client";

import { useState } from "react";
import { cn } from "./ui";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const QUARTERS = ["00", "15", "30", "45"];

function split(value: string): [string, string] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  return m ? [m[1].padStart(2, "0"), m[2]] : ["", ""];
}

/**
 * Time picker with separate hour and minute fields (minutes in quarter hours).
 * Submits one value "HH:MM" under `name` (or "" when empty). Works controlled
 * (`value` + `onChange`) or uncontrolled (`defaultValue`), like a <select>.
 * `endOfDay` adds 24:00 (for "until midnight"); `emptyLabel` allows no time at all.
 * A stored value outside the grid (e.g. 10:20) is kept as an extra minute option.
 */
export function TimeSelect({
  name,
  id,
  value,
  defaultValue,
  onChange,
  endOfDay = false,
  emptyLabel,
  required,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string; name?: string } }) => void;
  endOfDay?: boolean;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(String(defaultValue ?? ""));
  const current = controlled ? String(value ?? "") : inner;
  const [hour, minute] = split(current);
  // Uncontrolled forms that get a new default (e.g. after saving) follow it
  const [seenDefault, setSeenDefault] = useState(defaultValue);
  if (!controlled && defaultValue !== seenDefault) {
    setSeenDefault(defaultValue);
    setInner(String(defaultValue ?? ""));
  }

  const emit = (h: string, m: string) => {
    const next = h ? `${h}:${h === "24" ? "00" : m || "00"}` : "";
    if (!controlled) setInner(next);
    onChange?.({ target: { value: next, name } });
  };

  const hours = endOfDay ? [...HOURS, "24"] : HOURS;
  const minutes = minute && !QUARTERS.includes(minute) ? [minute, ...QUARTERS] : QUARTERS;
  const label = ariaLabel ?? "Uhrzeit";
  // Own classes (not fieldBase): fixed width so two digits always fit next to the arrow
  const select =
    "w-[4.75rem] shrink-0 rounded-lg border border-line bg-surface py-2 pl-2.5 pr-6 text-sm text-ink tabular-nums focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:opacity-50";

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {name && <input type="hidden" name={name} value={current} />}
      <select
        id={id}
        aria-label={`${label}: Stunde`}
        className={select}
        value={hour}
        required={required}
        disabled={disabled}
        onChange={(e) => emit(e.target.value, minute)}
      >
        {(emptyLabel !== undefined || !hour) && (
          <option value="" disabled={emptyLabel === undefined}>
            {emptyLabel ?? "–"}
          </option>
        )}
        {hours.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span aria-hidden className="text-ink-soft">
        :
      </span>
      <select
        aria-label={`${label}: Minute`}
        className={select}
        value={hour ? minute || "00" : ""}
        required={required}
        disabled={disabled || !hour || hour === "24"}
        onChange={(e) => emit(hour, e.target.value)}
      >
        {!hour && <option value="">–</option>}
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </span>
  );
}
