import type { ReactNode } from "react";
import { LEGAL_LAST_UPDATED } from "@/lib/site/content";

/**
 * Frame of a legal page. Text uses the `.legal` styles (globals.css).
 * Placeholders are written as <Ph>…</Ph> so they stand out until they are filled in.
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft">Stand: {LEGAL_LAST_UPDATED}</p>
      <div className="legal mt-8">{children}</div>
    </main>
  );
}

/** Highlighted placeholder for text that still has to be written or confirmed. */
export function Ph({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-amber-100 px-1 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
      [PLATZHALTER: {children}]
    </mark>
  );
}
