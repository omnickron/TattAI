"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Badge, cn } from "@/components/ui";

/** Everything the popup shows about a calendar entry (built on the server). */
export type EntryDetail = {
  kind: "CONSULTATION" | "TATTOO";
  title: string;
  leadId: string;
  leadName: string;
  phone: string | null;
  when: string;
  tattooerName: string;
  mode: string | null;
  status: { label: string; tone: "blue" | "green" | "amber" | "red" | "gray" | "violet" } | null;
  motif: string | null;
  summary: string[];
  amount: string | null;
  total: string | null;
  note: string | null;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** A calendar entry; a click opens the popup with all details. */
export function EntryChip({
  detail,
  className,
  style,
  title,
  children,
}: {
  detail: EntryDetail;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        title={title}
        onClick={() => setOpen(true)}
        className={cn("text-left", className)}
        style={style}
      >
        {children}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`entry-${detail.leadId}-title`}
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {detail.title}
                </p>
                <h2 id={`entry-${detail.leadId}-title`} className="mt-0.5 text-xl">
                  {detail.leadName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Schließen"
                className="-mr-2 -mt-1 rounded-lg p-2 text-ink-soft hover:bg-muted hover:text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <dl className="divide-y divide-line text-sm">
              <Row label="Wann">{detail.when}</Row>
              <Row label="Tätowierer">{detail.tattooerName}</Row>
              {detail.mode && <Row label="Beratungsform">{detail.mode}</Row>}
              {detail.status && (
                <Row label="Status">
                  <Badge tone={detail.status.tone}>{detail.status.label}</Badge>
                </Row>
              )}
              <Row label="Telefon">
                {detail.phone ? (
                  <a href={`tel:${detail.phone}`} className="underline underline-offset-2">
                    {detail.phone}
                  </a>
                ) : (
                  "–"
                )}
              </Row>
              <Row label="Motiv">
                {detail.motif ?? <span className="text-ink-soft">noch offen</span>}
              </Row>
              {detail.kind === "TATTOO" && (
                <Row label="Preis">
                  {detail.amount ?? <span className="text-amber-700">noch nicht eingetragen</span>}
                  {detail.total && <span className="text-ink-soft"> · gesamt {detail.total}</span>}
                </Row>
              )}
              {detail.summary.length > 0 && (
                <Row label="Tattoo-Idee">
                  <ul className="space-y-0.5">
                    {detail.summary.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </Row>
              )}
              {detail.note && <Row label="Notiz">{detail.note}</Row>}
            </dl>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-ink-soft hover:bg-muted hover:text-ink"
              >
                Schließen
              </button>
              <Link
                href={`/leads/${detail.leadId}`}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
              >
                Zum Kunden
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
