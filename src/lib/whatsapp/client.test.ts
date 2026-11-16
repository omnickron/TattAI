import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudApiClient } from "./client";

const client = () =>
  new CloudApiClient({
    accessToken: "t",
    phoneNumberId: "PHONE",
    businessAccountId: "MSGACC",
    apiVersion: "v27.0",
  });

describe("Cloud API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends templates and texts on behalf of the configured messaging account", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://graph.facebook.com/v27.0/PHONE/messages");
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }));
      }),
    );
    await client().sendTemplate({
      to: "+4915112345678",
      name: "hi",
      language: "de",
      parameters: [],
    });
    await client().sendText({ to: "+4915112345678", body: "Hallo" });
    expect(bodies.map((b) => b.messaging_account_id)).toEqual(["MSGACC", "MSGACC"]);
    expect(bodies[0].to).toBe("4915112345678");
  });
});
