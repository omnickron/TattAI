"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth/session";
import {
  billingConfigFromEnv,
  BillingError,
  cancelInvoice,
  createInvoice,
  monthLabel,
  setInvoicePaid,
} from "@/lib/billing/billing";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/format";

const fail = (err: unknown): ActionState => {
  if (err instanceof BillingError) return { ok: false, message: err.message };
  throw err;
};

export async function createInvoiceAction(month: string): Promise<ActionState> {
  const user = await requireAdmin();
  try {
    const inv = await createInvoice(prisma, {
      month,
      createdById: user.id,
      timeZone: APP_TIMEZONE,
      config: billingConfigFromEnv(),
    });
    revalidatePath("/admin/billing");
    return { ok: true, message: `Rechnung ${inv.number} für ${monthLabel(month)} erstellt.` };
  } catch (err) {
    return fail(err);
  }
}

export async function setPaidAction(id: string, paid: boolean): Promise<ActionState> {
  await requireAdmin();
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
  await requireAdmin();
  try {
    await cancelInvoice(prisma, id);
    revalidatePath("/admin/billing");
    revalidatePath(`/admin/billing/${id}`);
    return { ok: true, message: "Rechnung storniert." };
  } catch (err) {
    return fail(err);
  }
}
