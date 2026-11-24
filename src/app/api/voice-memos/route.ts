import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createVoiceMemo, MAX_VOICE_UPLOAD_BYTES, VoiceError } from "@/lib/whatsapp/voice";

/**
 * Upload of a voice memo (admin). The raw file is the request body, the name comes
 * URL-encoded in the X-File-Name header. It is converted to ogg/opus right away.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Bitte anmelden." }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "Nur für Admins." }, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_VOICE_UPLOAD_BYTES)
    return Response.json({ error: "Die Aufnahme ist zu groß (höchstens 10 MB)." }, { status: 413 });
  const name = decodeURIComponent(request.headers.get("x-file-name") ?? "").slice(0, 100);
  // What is said in the recording, for the bot (URL-encoded header)
  const transcript = decodeURIComponent(request.headers.get("x-transcript") ?? "").slice(0, 2000);
  try {
    const data = new Uint8Array(await request.arrayBuffer());
    const memo = await createVoiceMemo(prisma, { name, data, transcript });
    return Response.json({ id: memo.id });
  } catch (err) {
    if (err instanceof VoiceError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[voice] upload failed:", err);
    return Response.json(
      { error: "Upload fehlgeschlagen. Bitte erneut versuchen." },
      { status: 500 },
    );
  }
}
