import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  refreshIntegrationSettings,
  resetIntegrationCache,
  saveIntegrationSetting,
  setting,
  settingSource,
} from "@/lib/integrations/store";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const user = { id: "u1", name: "Betreiber" };
const env = {
  TEAMUP_API_KEY: "env-key",
  META_APP_SECRET: "meta-secret",
} as unknown as NodeJS.ProcessEnv;

beforeEach(async () => {
  await resetDatabase(prisma);
  resetIntegrationCache();
});
afterEach(() => resetIntegrationCache());
afterAll(() => prisma.$disconnect());

describe("access data maintained in the app", () => {
  it("prefers the app value, stores secrets encrypted and falls back to the .env", async () => {
    expect(setting("TEAMUP_API_KEY", env)).toBe("env-key");
    expect(settingSource("TEAMUP_API_KEY", env)).toBe("env");

    await saveIntegrationSetting(prisma, "TEAMUP_API_KEY", "  app-secret-key-1234 ", user);
    const row = await prisma.integrationSetting.findUniqueOrThrow({
      where: { key: "TEAMUP_API_KEY" },
    });
    expect(row.value).not.toContain("app-secret");
    expect(row.value.startsWith("v1.")).toBe(true);
    expect(row.hint).toBe("1234");

    // Another process (fresh cache) reads it from the database
    resetIntegrationCache();
    expect(setting("TEAMUP_API_KEY", env)).toBe("env-key");
    await refreshIntegrationSettings(prisma);
    expect(setting("TEAMUP_API_KEY", env)).toBe("app-secret-key-1234");
    expect(settingSource("TEAMUP_API_KEY", env)).toBe("app");

    // IDs are stored as they are
    await saveIntegrationSetting(prisma, "WHATSAPP_PHONE_NUMBER_ID", "1234567890", user);
    expect(
      (
        await prisma.integrationSetting.findUniqueOrThrow({
          where: { key: "WHATSAPP_PHONE_NUMBER_ID" },
        })
      ).value,
    ).toBe("1234567890");

    // Removing it brings back the .env value; every change is logged without the value
    await saveIntegrationSetting(prisma, "TEAMUP_API_KEY", "", user);
    expect(setting("TEAMUP_API_KEY", env)).toBe("env-key");
    const log = await prisma.integrationSettingLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(log.map((l) => `${l.key}:${l.action}`)).toEqual([
      "TEAMUP_API_KEY:set",
      "WHATSAPP_PHONE_NUMBER_ID:set",
      "TEAMUP_API_KEY:cleared",
    ]);
    expect(JSON.stringify(log)).not.toContain("app-secret");
  });

  it("uses the Meta app secret for WhatsApp webhooks when no own one is set", () => {
    expect(setting("WHATSAPP_APP_SECRET", env)).toBe("meta-secret");
  });

  it("rejects unknown settings", async () => {
    await expect(saveIntegrationSetting(prisma, "DATABASE_URL", "x", user)).rejects.toThrow(
      /Unknown setting/,
    );
  });
});
