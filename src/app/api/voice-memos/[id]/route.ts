import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { voiceFilePath } from "@/lib/whatsapp/voice";

/** Plays a voice memo in the app (signed-in team members only). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const memo = await prisma.voiceMemo.findUnique({ where: { id } });
  if (!memo) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(voiceFilePath(memo.storagePath));
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "audio/ogg",
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
