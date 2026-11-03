import { readFile } from "node:fs/promises";
import { getCurrentUser, leadScope } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { attachmentFilePath } from "@/lib/whatsapp/media";

/** Serves a customer file only to the admin and the assigned tattooer. Never cached publicly. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const attachment = await prisma.leadAttachment.findFirst({
    where: { id, status: "STORED", lead: leadScope(user) },
  });
  if (!attachment?.storagePath) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(attachmentFilePath(attachment.storagePath));
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": attachment.mimeType ?? "application/octet-stream",
        "content-disposition": "inline",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
