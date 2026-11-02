import "server-only";
import { prisma } from "../db";
import { createLeadFetcher } from "../meta/fetcher";
import { defaultPhoneCountry } from "../settings";
import type { IngestDeps } from "./meta-ingest";

export function ingestDeps(): IngestDeps {
  return { prisma, fetcher: createLeadFetcher(), defaultCountry: defaultPhoneCountry() };
}
