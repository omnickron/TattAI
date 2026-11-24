"use client";

import { useActionState } from "react";
import { cn } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

/**
 * "Manuell betreut" switch for one chat: on = a person handles the customer and the bot
 * stays silent; off = the bot answers again. A bot handover turns it on automatically.
 */
export function BotToggle({
  enabled,
  action,
}: {
  enabled: boolean;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <button
        type="submit"
        role="switch"
        aria-checked={!enabled}
        aria-label="Manuell betreut"
        disabled={pending}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60",
          !enabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-600",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
            !enabled ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
      <span className="text-sm font-medium">
        Manuell betreut
        <span className="ml-1.5 font-normal text-ink-soft">
          {enabled ? "· Bot antwortet" : "· Bot aus"}
        </span>
      </span>
      {state && !state.ok && <span className="text-xs text-red-600">{state.message}</span>}
    </form>
  );
}
