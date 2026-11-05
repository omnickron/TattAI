"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/components/ui";
import { deleteContentAction, toggleSelectedAction } from "./actions";

export function ItemActions({
  id,
  selected,
  isAdmin,
}: {
  id: string;
  selected: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  return (
    <div className="flex items-center gap-1">
      {isAdmin && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => toggleSelectedAction(id))}
          title={selected ? "Markierung entfernen" : "Für Anzeige markieren"}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium",
            selected ? "bg-ink text-paper" : "text-ink-soft hover:bg-muted hover:text-ink",
          )}
        >
          {selected ? "★ Für Anzeige" : "☆ Für Anzeige"}
        </button>
      )}
      <a
        href={`/api/content/${id}?download=1`}
        className="rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-muted hover:text-ink"
      >
        Laden
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Diese Datei wirklich löschen?")) run(() => deleteContentAction(id));
        }}
        className="rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-red-50 hover:text-red-700"
      >
        Löschen
      </button>
    </div>
  );
}
