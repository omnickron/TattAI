"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { isOperator } from "@/lib/auth/operator";
import { requireAdmin } from "@/lib/auth/session";
import {
  loadBillingConfig,
  BillingError,
  cancelInvoice,
  createInvoice,
  monthLabel,
  setInvoicePaid,
} from "@/lib/billing/billing";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/format";

const ONLY_OPERATOR: ActionState = {
  ok: false,
  message: "Rechnungen erstellt und verwaltet nur der Betreiber von NEEDL.",
};

const fail = (err: unknown): ActionState => {
  if (err instanceof BillingError) return { ok: false, message: err.message };
  throw err;
};

export async function createInvoiceAction(month: string): Promise<ActionState> {
  const user = await requireAdmin();
  if (!isOperator(user)) return ONLY_OPERATOR;
  try {
    const inv = await createInvoice(prisma, {
      month,
      createdById: user.id,
      timeZone: APP_TIMEZONE,
      config: await loadBillingConfig(prisma),
    });
    revalidatePath("/admin/billing");
    return { ok: true, message: `Rechnung ${inv.number} für ${monthLabel(month)} erstellt.` };
  } catch (err) {
    return fail(err);
  }
}

export async function setPaidAction(id: string, paid: boolean): Promise<ActionState> {
  if (!isOperator(await requireAdmin())) return ONLY_OPERATOR;
  try {
    await setInvoicePaid(prisma, id, paid);
    revalidatePath("/admin/billing");
    revalidatePath(`/admin/billing/${id}`);
    return { ok: true, message: paid ? "Als bezahlt markiert." : "Wieder offen." };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelInvoiceAction(id: string): Promise<ActionState> {
  if (!isOperator(await requireAdmin())) return ONLY_OPERATOR;
  try {
    await cancelInvoice(prisma, id);
    revalidatePath("/admin/billing");
    revalidatePath(`/admin/billing/${id}`);
    return { ok: true, message: "Rechnung storniert." };
  } catch (err) {
    return fail(err);
  }
}
