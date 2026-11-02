// Sends a correctly signed fake inbound WhatsApp message to the running app.
// Usage: npm run dev:simulate-whatsapp -- +4915112345678 "Hallo, ich hätte gern einen Termin"
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { signMetaPayload } from "../src/lib/meta/signature";

async function main() {
  const [phone, text = "Hallo!"] = process.argv.slice(2);
  if (!phone) throw new Error("Usage: simulate-whatsapp <+49…> [text]");
  const secret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "";
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-dev",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ wa_id: phone.replace(/^\+/, ""), profile: { name: "Test" } }],
              messages: [
                {
                  id: `wamid.sim-${randomUUID()}`,
                  from: phone.replace(/^\+/, ""),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const res = await fetch(
    `${process.env.APP_URL || "http://localhost:3000"}/api/webhooks/whatsapp`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signMetaPayload(body, secret),
      },
      body,
    },
  );
  console.log(res.status, await res.text());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
