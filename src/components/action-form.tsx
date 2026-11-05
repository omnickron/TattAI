"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "./ui";

/**
 * Form wrapper around a server action that shows its error/success message.
 * Entries are kept when the action fails (React would otherwise reset the form to its old
 * values); after a success the form is reset to the freshly saved values.
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
    if (state?.ok) formRef.current?.reset();
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
