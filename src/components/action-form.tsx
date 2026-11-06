"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "./ui";

/**
 * Form wrapper around a server action that shows its error/success message.
 * Entries are kept when the action fails (React would otherwise reset the form to its old
 * values); after a success text fields are reset and selects keep the saved choice.
 */
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
  const formRef = useRef<HTMLFormElement>(null);
  // After a success, the page re-renders with the saved values – reset to those
  // (and clear "add" forms such as a new note).
  useEffect(() => {
    const form = formRef.current;
    if (!state?.ok || !form) return;
    // Selects keep the chosen (= just saved) value: React only sets their default on the first
    // render, so a plain reset would jump back to the value from before saving.
    const selects = [...form.querySelectorAll("select")].map((el) => [el, el.value] as const);
    form.reset();
    for (const [el, value] of selects) el.value = value;
  }, [state]);
  return (
    <form
      ref={formRef}
      className="space-y-3"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
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
            state.warning
              ? "text-amber-700 dark:text-amber-400"
              : state.ok
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-600",
          )}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
