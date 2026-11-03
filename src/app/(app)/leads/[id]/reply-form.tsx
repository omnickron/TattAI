"use client";

import { useActionState } from "react";
import { Button, Textarea, cn } from "@/components/ui";
import type { ReplyState } from "./actions";

const MAX = 4096;

/** Free-form WhatsApp reply. Keeps the text if sending fails. */
export function ReplyForm({
  action,
}: {
  action: (prev: ReplyState, formData: FormData) => Promise<ReplyState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-2">
      <Textarea
        // Re-mount with the unsent text after an error; empty after success.
        key={state?.ok === false ? `err-${state.message}` : "draft"}
        name="text"
        defaultValue={state?.ok === false ? state.text : ""}
        placeholder="Antwort schreiben … (erscheint beim Kunden in WhatsApp)"
        rows={3}
        maxLength={MAX}
        required
        disabled={pending}
        onKeyDown={(e) => {
          // Ctrl/Cmd + Enter sends
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Wird gesendet …" : "Per WhatsApp senden"}
        </Button>
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
      </div>
    </form>
  );
}
