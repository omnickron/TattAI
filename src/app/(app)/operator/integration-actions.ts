"use server";

import { createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createTeamupClient } from "@/lib/google/client";
import { GROUPS, SETTINGS, type IntegrationGroup } from "@/lib/integrations/registry";
import { saveIntegrationSetting, setting } from "@/lib/integrations/store";

const groupOf = (id: string) => GROUPS.find((g) => g.id === id);

/** Saves the filled fields of one integration (empty fields stay unchanged). */
export async function saveIntegration(
  group: IntegrationGroup,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOperator();
  if (!groupOf(group)) return { ok: false, message: "Unbekannter Bereich." };
  let changed = 0;
  for (const def of SETTINGS.filter((s) => s.group === group)) {
    const value = String(formData.get(def.key) ?? "").trim();
    if (!value) continue;
    if (value.length > 2000) return { ok: false, message: `${def.label}: zu lang.` };
    await saveIntegrationSetting(prisma, def.key, value, user);
    changed++;
  }
  revalidatePath("/operator");
  return changed
    ? {
        ok: true,
        message: `${changed} ${changed === 1 ? "Wert" : "Werte"} gespeichert. Gilt sofort.`,
      }
    : { ok: false, message: "Nichts eingetragen – leere Felder bleiben unverändert." };
}

/** Removes a value from the app (the .env applies again, if set). */
export async function clearIntegrationSetting(key: string): Promise<ActionState> {
  const user = await requireOperator();
  if (!SETTINGS.some((s) => s.key === key)) return { ok: false, message: "Unbekannt." };
  await saveIntegrationSetting(prisma, key, null, user);
  revalidatePath("/operator");
  return { ok: true, message: "Entfernt." };
}

/** Test mode (sample data) or live for one integration. */
export async function setIntegrationLive(
  group: IntegrationGroup,
  live: boolean,
): Promise<ActionState> {
  const user = await requireOperator();
  const g = groupOf(group);
  if (!g) return { ok: false, message: "Unbekannter Bereich." };
  await saveIntegrationSetting(prisma, g.modeKey, live ? "false" : "true", user);
  revalidatePath("/operator");
  return {
    ok: true,
    message: live ? `${g.title} ist jetzt live.` : `${g.title} läuft im Testmodus.`,
  };
}

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || "v23.0"}`;

async function graphGet(path: string, token: string, appSecret?: string) {
  const url = new URL(`${GRAPH()}${path}`);
  url.searchParams.set("access_token", token);
  if (appSecret)
    url.searchParams.set(
      "appsecret_proof",
      createHmac("sha256", appSecret).update(token).digest("hex"),
    );
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body;
}

/** Checks the access data of one integration against the real service. */
export async function testIntegration(group: IntegrationGroup): Promise<ActionState> {
  await requireOperator();
  try {
    if (group === "teamup") {
      const subs = await createTeamupClient().listSubcalendars();
      return { ok: true, message: `TeamUp erreichbar – ${subs.length} Unterkalender.` };
    }
    if (group === "whatsapp") {
      const token = setting("WHATSAPP_ACCESS_TOKEN");
      const phoneId = setting("WHATSAPP_PHONE_NUMBER_ID");
      if (!token || !phoneId) return { ok: false, message: "Token oder Telefonnummer-ID fehlt." };
      const info = await graphGet(`/${phoneId}?fields=display_phone_number,verified_name`, token);
      return {
        ok: true,
        message: `WhatsApp erreichbar – Nummer ${info.display_phone_number ?? "?"} (${info.verified_name ?? "ohne Namen"}).`,
      };
    }
    const token = setting("META_PAGE_ACCESS_TOKEN");
    if (!token) return { ok: false, message: "Seiten-Zugriffstoken fehlt." };
    const me = await graphGet("/me?fields=name", token, setting("META_APP_SECRET"));
    return { ok: true, message: `Meta erreichbar – Seite „${me.name ?? "?"}“.` };
  } catch (err) {
    return {
      ok: false,
      message:
        `Verbindung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`.slice(
          0,
          300,
        ),
    };
  }
}
