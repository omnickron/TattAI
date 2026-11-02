import type { CountryCode } from "libphonenumber-js";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ConsentSettings } from "./meta/map-lead";

export async function getConsentSettings(prisma: PrismaClient): Promise<ConsentSettings> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  return {
    checkboxKey: settings?.consentCheckboxKey?.trim() || null,
    text: settings?.consentText?.trim() || null,
  };
}

export function defaultPhoneCountry(): CountryCode {
  return (process.env.PHONE_DEFAULT_COUNTRY?.toUpperCase() || "DE") as CountryCode;
}
