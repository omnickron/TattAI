"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "./ui";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const QUARTERS = ["00", "15", "30", "45"];

function split(value: string): [string, string] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  return m ? [m[1].padStart(2, "0"), m[2]] : ["", ""];
}

/**
 * Compact time picker: a field showing "HH:MM" that opens a small grid – hours 00–23 in
 * four rows, then the quarter hours. Two taps, no scrolling through long lists.
 * Submits one value "HH:MM" under `name` (or "" when empty). Works controlled
 * (`value` + `onChange`) or uncontrolled (`defaultValue`), like a <select>.
 * `endOfDay` adds 24:00 (for "until midnight"); `emptyLabel` allows no time at all.
 * A stored value outside the grid (e.g. 10:20) is kept and shown as an extra minute.
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

  const [open, setOpen] = useState(false);
  // Hour picked in the open panel, waiting for the minutes
  const [pendingHour, setPendingHour] = useState<string | null>(null);
  // Open to the left when there is not enough room on the right (e.g. "bis" on a phone)
  const [alignRight, setAlignRight] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const emit = (next: string) => {
    if (!controlled) setInner(next);
    onChange?.({ target: { value: next, name } });
  };

  const shownHour = pendingHour ?? hour;
  const pickHour = (h: string) => {
    if (h === "24") {
      emit("24:00");
      setPendingHour(null);
      setOpen(false);
      return;
    }
    setPendingHour(h);
  };
  const pickMinute = (m: string) => {
    const h = shownHour || "00";
    emit(`${h}:${m}`);
    setPendingHour(null);
    setOpen(false);
  };

  const hours = endOfDay ? [...HOURS, "24"] : HOURS;
  const minutes = minute && !QUARTERS.includes(minute) ? [minute, ...QUARTERS] : QUARTERS;
  const label = ariaLabel ?? "Uhrzeit";
  const display = current ? `${hour}:${minute}` : (emptyLabel ?? "--:--");
  const cell =
    "rounded-md px-1 py-1.5 text-sm tabular-nums hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

  return (
    <span ref={root} className={cn("relative inline-flex", className)}>
      {name && <input type="hidden" name={name} value={current} />}
      {/* Keeps native "required" validation: an invisible field that is empty until a time is picked */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={current}
          onChange={() => {}}
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      )}
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={`${label}: ${current ? display : "nicht gesetzt"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setPendingHour(null);
          const rect = root.current?.getBoundingClientRect();
          setAlignRight(Boolean(rect && rect.left + 272 > window.innerWidth));
          setOpen((o) => !o);
        }}
        className={cn(
          "w-[5.25rem] shrink-0 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm tabular-nums focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:opacity-50",
          current ? "text-ink" : "text-ink-soft",
          open && "border-ink ring-1 ring-ink",
        )}
      >
        {display}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute top-full z-50 mt-1 w-[16.5rem] rounded-xl border border-line bg-surface p-2 shadow-lg",
            alignRight ? "right-0" : "left-0",
          )}
        >
          <p className="px-1 pb-1 text-xs text-ink-soft">Stunde</p>
          <div className="grid grid-cols-6 gap-0.5">
            {hours.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => pickHour(h)}
                aria-pressed={shownHour === h}
                className={cn(cell, shownHour === h && "bg-ink text-paper hover:bg-ink")}
              >
                {h}
              </button>
            ))}
          </div>
          <p className="px-1 pb-1 pt-2 text-xs text-ink-soft">
            Minute{shownHour && shownHour !== "24" ? ` (${shownHour} Uhr)` : ""}
          </p>
          <div className="grid grid-cols-4 gap-0.5">
            {minutes.map((m) => (
              <button
                key={m}
                type="button"
                disabled={shownHour === "24"}
                onClick={() => pickMinute(m)}
                aria-pressed={!pendingHour && minute === m}
                className={cn(
                  cell,
                  "disabled:opacity-40",
                  !pendingHour && current && minute === m && "bg-ink text-paper hover:bg-ink",
                )}
              >
                :{m}
              </button>
            ))}
          </div>
          {emptyLabel !== undefined && current && (
            <button
              type="button"
              onClick={() => {
                emit("");
                setPendingHour(null);
                setOpen(false);
              }}
              className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-ink-soft hover:bg-muted"
            >
              Uhrzeit entfernen
            </button>
          )}
        </div>
      )}
    </span>
  );
}
