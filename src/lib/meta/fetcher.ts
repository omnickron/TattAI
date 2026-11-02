import { GraphApiLeadFetcher, MockLeadFetcher } from "./graph";
import type { MetaLeadFetcher } from "./types";

/** Picks the real Graph API client or the sample-data mock based on env. */
export function createLeadFetcher(): MetaLeadFetcher {
  if (process.env.META_GRAPH_MOCK === "true") return new MockLeadFetcher();
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const appSecret = process.env.META_APP_SECRET;
  if (!accessToken || !appSecret) {
    throw new Error("META_PAGE_ACCESS_TOKEN and META_APP_SECRET must be set (or META_GRAPH_MOCK=true)");
  }
  return new GraphApiLeadFetcher({
    accessToken,
    appSecret,
    apiVersion: process.env.META_GRAPH_API_VERSION || "v23.0",
  });
}
