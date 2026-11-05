"use server";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const valid = (s: PushSubscriptionInput) =>
  typeof s?.endpoint === "string" &&
  /^https:\/\//.test(s.endpoint) &&
  s.endpoint.length < 1000 &&
  typeof s.keys?.p256dh === "string" &&
  typeof s.keys?.auth === "string" &&
  s.keys.p256dh.length < 200 &&
  s.keys.auth.length < 100;

/** Stores this device's push subscription for the signed-in user. */
export async function savePushSubscription(sub: PushSubscriptionInput, userAgent: string) {
  const user = await requireUser();
  if (!valid(sub)) return { ok: false };
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: {
      userId: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent.slice(0, 200),
    },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const user = await requireUser();
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true };
}
