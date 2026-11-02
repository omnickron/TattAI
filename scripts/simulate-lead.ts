// Sends a correctly signed fake `leadgen` webhook to the running app, like Meta would.
// Usage: npm run dev:simulate-lead [-- <count>]
import "dotenv/config";
import { randomInt } from "node:crypto";
import { signMetaPayload } from "../src/lib/meta/signature";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const secret = process.env.META_APP_SECRET ?? "";
if (!secret) throw new Error("META_APP_SECRET is not set");
const count = Number(process.argv[2] ?? 1);

const ids = Array.from({ length: count }, () => `sim-${Date.now()}-${randomInt(1e6)}`);
const body = JSON.stringify({
  object: "page",
  entry: [
    {
      id: "page-dev",
      time: Math.floor(Date.now() / 1000),
      changes: ids.map((leadgen_id) => ({
        field: "leadgen",
        value: {
          leadgen_id,
          page_id: "page-dev",
          form_id: "900000000000001",
          created_time: Math.floor(Date.now() / 1000),
        },
      })),
    },
  ],
});

async function main() {
  const res = await fetch(`${appUrl}/api/webhooks/meta`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signMetaPayload(body, secret),
    },
    body,
  });
  console.log(`${res.status} ${await res.text()} – sent lead id(s): ${ids.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
