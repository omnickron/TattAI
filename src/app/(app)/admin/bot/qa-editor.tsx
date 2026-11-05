"use client";

import { useState } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import type { QA } from "@/lib/bot/knowledge";

/** Editable list of question → answer pairs; submitted as JSON in "items". */
export function QAEditor({
  initial,
  qLabel,
  aLabel,
  qPlaceholder,
  aPlaceholder,
}: {
  initial: QA[];
  qLabel: string;
  aLabel: string;
  qPlaceholder: string;
  aPlaceholder: string;
}) {
  const [items, setItems] = useState<QA[]>(initial.length ? initial : [{ q: "", a: "" }]);
  const set = (i: number, patch: Partial<QA>) =>
    setItems((all) => all.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(items.filter((x) => x.q.trim() && x.a.trim()))}
      />
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li key={i} className="rounded-lg border border-line bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-soft">#{i + 1}</span>
              <button
                type="button"
                onClick={() => setItems((all) => all.filter((_, k) => k !== i))}
                className="text-xs text-ink-soft hover:text-red-700"
              >
                Entfernen
              </button>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="text-xs text-ink-soft">{qLabel}</span>
              <Input
                value={it.q}
                maxLength={300}
                placeholder={qPlaceholder}
                onChange={(e) => set(i, { q: e.target.value })}
              />
            </label>
            <label className="mt-2 block space-y-1 text-sm">
              <span className="text-xs text-ink-soft">{aLabel}</span>
              <Textarea
                value={it.a}
                rows={2}
                maxLength={1500}
                placeholder={aPlaceholder}
                onChange={(e) => set(i, { a: e.target.value })}
              />
            </label>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setItems((all) => [...all, { q: "", a: "" }])}
        >
          + Weitere hinzufügen
        </Button>
        <span className="text-xs text-ink-soft">
          {items.filter((x) => x.q.trim() && x.a.trim()).length} vollständig
        </span>
      </div>
    </div>
  );
}
