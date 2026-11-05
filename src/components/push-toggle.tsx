"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/(app)/push-actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function base64UrlToBytes(value: string) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

const TITLES: Record<State, string> = {
  loading: "Benachrichtigungen",
  unsupported: "Dieser Browser unterstützt keine Push-Benachrichtigungen",
  "ios-install":
    "Auf dem iPhone: NEEDL über „Teilen → Zum Home-Bildschirm“ installieren, dann hier einschalten",
  denied: "Benachrichtigungen sind im Browser blockiert – in den Website-Einstellungen erlauben",
  off: "Push-Benachrichtigungen einschalten (z. B. wenn der Bot an euch übergibt)",
  on: "Push-Benachrichtigungen sind an – zum Ausschalten tippen",
};

/** Bell button: subscribes this device to push notifications. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      if (!publicKey) return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [publicKey]);

  const toggle = () =>
    startTransition(async () => {
      if (state === "ios-install" || state === "unsupported" || state === "denied") {
        alert(TITLES[state]);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (state === "on" && existing) {
        await removePushSubscription(existing.endpoint);
        await existing.unsubscribe();
        setState("off");
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        setState("denied");
        return;
      }
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(publicKey!),
        }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await savePushSubscription(json, navigator.userAgent);
      setState(r.ok ? "on" : "off");
    });

  // Push not set up on the server (no VAPID keys): no button
  if (!publicKey) return null;
  const on = state === "on";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || state === "loading"}
      title={TITLES[state]}
      aria-label={TITLES[state]}
      aria-pressed={on}
      className={`relative rounded-lg p-2 hover:bg-muted ${on ? "text-ink" : "text-ink-soft"} disabled:opacity-50`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        {!on && state !== "loading" && <path d="M3 3l18 18" />}
      </svg>
    </button>
  );
}
