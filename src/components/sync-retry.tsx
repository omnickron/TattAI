"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "./ui";

/** "Nicht mit Google/TeamUp synchronisiert" – click to retry the calendar sync right away. */
export function SyncRetry({
  action,
  reason,
  canRetry,
  target = "Google",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  reason: string | null;
  canRetry: boolean;
  /** Calendar name shown in the label. */
  target?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  // Show the confirmation for a moment, then reload the data (the line disappears).
  useEffect(() => {
    if (!state?.ok) return;
    const t = setTimeout(() => router.refresh(), 1500);
    return () => clearTimeout(t);
  }, [state, router]);
  const message = state?.message ?? reason;
  return (
    <form
      action={formAction}
      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-10 text-xs"
    >
      {canRetry ? (
        <button
          type="submit"
          disabled={pending || Boolean(state?.ok)}
          className={cn(
            "font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid disabled:opacity-60",
            state?.ok
              ? "text-emerald-700 no-underline disabled:opacity-100 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-400",
          )}
          title={`Erneut mit ${target} synchronisieren`}
        >
          {pending
            ? "Wird synchronisiert …"
            : state?.ok
              ? `✓ Mit ${target} synchronisiert`
              : `Nicht mit ${target} synchronisiert – erneut versuchen`}
        </button>
      ) : (
        <span className="font-medium text-amber-700 dark:text-amber-400">
          Nicht mit {target} synchronisiert
        </span>
      )}
      {message && !pending && !state?.ok && (
        <span
          className={cn(state?.ok ? "text-emerald-700 dark:text-emerald-400" : "text-ink-soft")}
        >
          {message}
        </span>
      )}
    </form>
  );
}
