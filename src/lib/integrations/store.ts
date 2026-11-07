/**
 * Integration settings at runtime: value from the app (decrypted) if set, otherwise the
 * environment variable. The app values are cached in memory and refreshed periodically
 * (instrumentation.ts for the web server, every tick in the worker), so the many
 * synchronous call sites can read them without touching the database.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { decryptSecret, encryptSecret } from "../crypto";
import { ALL_KEYS, settingDef } from "./registry";

let cache = new Map<string, string>();
let loadedAt = 0;

type Db = Pick<PrismaClient, "integrationSetting">;

/** Loads the app values into memory (call regularly; cheap: a handful of rows). */
export async function refreshIntegrationSettings(prisma: Db) {
  const rows = await prisma.integrationSetting.findMany();
  const next = new Map<string, string>();
  for (const r of rows) {
    const def = settingDef(r.key);
    try {
      next.set(r.key, def?.secret ? decryptSecret(r.value) : r.value);
    } catch (err) {
      console.error(
        `[integrations] cannot decrypt ${r.key}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  cache = next;
  loadedAt = Date.now();
  return next.size;
}

export const integrationSettingsLoadedAt = () => loadedAt;

/** Effective value: app value, otherwise env (and the optional env fallback). */
export function setting(key: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromApp = cache.get(key);
  if (fromApp !== undefined && fromApp !== "") return fromApp;
  const fromEnv = env[key]?.trim();
  if (fromEnv) return fromEnv;
  const fallback = settingDef(key)?.envFallback;
  return fallback ? env[fallback]?.trim() || undefined : undefined;
}

/** Where a value currently comes from (for the operator page; never the value of a secret). */
export function settingSource(key: string, env: NodeJS.ProcessEnv = process.env) {
  if (cache.get(key)) return "app" as const;
  if (env[key]?.trim()) return "env" as const;
  const fallback = settingDef(key)?.envFallback;
  if (fallback && env[fallback]?.trim()) return "env" as const;
  return "missing" as const;
}

export function lastChars(value: string) {
  return value.length > 8 ? value.slice(-4) : null;
}

/** Saves (or with an empty value: removes) an app value; logs who did it. */
export async function saveIntegrationSetting(
  prisma: Pick<PrismaClient, "integrationSetting" | "integrationSettingLog">,
  key: string,
  value: string | null,
  user: { id: string; name: string },
) {
  if (!ALL_KEYS.has(key)) throw new Error(`Unknown setting ${key}`);
  const def = settingDef(key);
  const v = value?.trim() ?? "";
  if (!v) {
    const removed = await prisma.integrationSetting.deleteMany({ where: { key } });
    if (removed.count)
      await prisma.integrationSettingLog.create({
        data: { key, action: "cleared", userId: user.id, userName: user.name },
      });
    cache.delete(key);
    return;
  }
  const stored = def?.secret ? encryptSecret(v) : v;
  const hint = def?.secret ? lastChars(v) : null;
  await prisma.integrationSetting.upsert({
    where: { key },
    update: { value: stored, hint, updatedById: user.id },
    create: { key, value: stored, hint, updatedById: user.id },
  });
  await prisma.integrationSettingLog.create({
    data: { key, action: "set", userId: user.id, userName: user.name },
  });
  cache.set(key, v);
}

/** For tests: start from an empty cache. */
export function resetIntegrationCache() {
  cache = new Map();
  loadedAt = 0;
}
