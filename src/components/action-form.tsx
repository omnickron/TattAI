"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "./ui";

/** Form wrapper around a server action that shows its error/success message. */
export function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className="space-y-3"
      aria-busy={pending}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <fieldset disabled={pending} className={cn("m-0 min-w-0 space-y-4 border-0 p-0", className)}>
        {children}
      </fieldset>
      {state && (
        <p
          role="status"
          className={cn(
            "text-sm",
            state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600",
          )}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
