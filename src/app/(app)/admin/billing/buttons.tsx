"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/components/ui";

/** Small button that runs a server action (with optional confirm) and shows its message. */
export function ActionButton({
  action,
  confirm,
  children,
  variant = "secondary",
}: {
  action: () => Promise<ActionState>;
  confirm?: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const res = await action();
            setState(res);
            router.refresh();
          });
        }}
        className={cn(
          "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60",
          variant === "primary" && "bg-ink text-paper hover:opacity-90",
          variant === "secondary" && "border border-line bg-surface hover:bg-muted",
          variant === "danger" && "text-red-700 hover:bg-red-50",
        )}
      >
        {pending ? "…" : children}
      </button>
      {state && !state.ok && <span className="text-xs text-red-600">{state.message}</span>}
    </span>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
    >
      Drucken / als PDF speichern
    </button>
  );
}
