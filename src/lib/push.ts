/**
 * Web push to the team's phones/browsers (installed PWA). Needs VAPID keys in the
 * environment (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT); without them
 * pushes are only logged. Sending never throws: a failed push must not break the caller.
 */
import webpush from "web-push";
import type { PrismaClient } from "@/generated/prisma/client";

export interface PushPayload {
  title: string;
  body: string;
  /** Path in the app opened on tap, e.g. /leads/abc */
  url: string;
  tag?: string;
}

export interface PushSender {
  readonly configured: boolean;
  send(
    sub: { endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
  ): Promise<{ gone: boolean }>;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function createPushSender(env: NodeJS.ProcessEnv = process.env): PushSender {
  const pub = env.VAPID_PUBLIC_KEY?.trim();
  const priv = env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) {
    return {
      configured: false,
      async send(_sub, payload) {
        console.info(`[push] (nicht eingerichtet) ${payload.title}: ${payload.body}`);
        return { gone: false };
      },
    };
  }
  const subject = env.VAPID_SUBJECT?.trim() || `mailto:${env.ADMIN_EMAIL ?? "admin@example.com"}`;
  return {
    configured: true,
    async send(sub, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { vapidDetails: { subject, publicKey: pub, privateKey: priv }, TTL: 24 * 3600 },
        );
        return { gone: false };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return { gone: true };
        console.error("[push] send failed:", status ?? err);
        return { gone: false };
      }
    },
  };
}

/** Sends a push to all devices of the given users; removes expired subscriptions. */
export async function pushToUsers(
  prisma: Pick<PrismaClient, "pushSubscription">,
  sender: PushSender,
  userIds: string[],
  payload: PushPayload,
) {
  if (!userIds.length) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  let sent = 0;
  for (const s of subs) {
    try {
      const r = await sender.send(s, payload);
      if (r.gone) await prisma.pushSubscription.delete({ where: { id: s.id } });
      else sent++;
    } catch (err) {
      console.error("[push] failed:", err);
    }
  }
  return sent;
}

export async function activeAdminIds(prisma: Pick<PrismaClient, "user">) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}
