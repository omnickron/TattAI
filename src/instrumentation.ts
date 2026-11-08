/**
 * Server start: load the integration settings maintained in the app (TeamUp, WhatsApp,
 * Meta) into memory and refresh them every 30 seconds, so changes apply without restart.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prisma } = await import("./lib/db");
  const { refreshIntegrationSettings } = await import("./lib/integrations/store");
  const refresh = () =>
    refreshIntegrationSettings(prisma).catch((err) =>
      console.error("[integrations] refresh failed:", err instanceof Error ? err.message : err),
    );
  await refresh();
  setInterval(refresh, 30_000).unref();
}
