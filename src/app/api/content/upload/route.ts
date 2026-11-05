import { getCurrentUser } from "@/lib/auth/session";
import { ContentError, storeContentStream } from "@/lib/content/storage";
import { prisma } from "@/lib/db";

/**
 * Upload of one photo/video. The raw file is the request body (streamed to disk),
 * the file name comes URL-encoded in the X-File-Name header.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Bitte anmelden." }, { status: 401 });
  if (!request.body) return Response.json({ error: "Keine Datei erhalten." }, { status: 400 });

  const mime = request.headers.get("content-type") ?? "";
  const name =
    decodeURIComponent(request.headers.get("x-file-name") ?? "").slice(0, 200) || "Upload";
  try {
    const stored = await storeContentStream(request.body, { mime });
    const item = await prisma.contentItem.create({
      data: { uploaderId: user.id, originalName: name, ...stored },
      select: { id: true },
    });
    return Response.json({ id: item.id });
  } catch (err) {
    if (err instanceof ContentError)
      return Response.json({ error: err.message }, { status: err.status });
    console.error("[content] upload failed:", err);
    return Response.json(
      { error: "Upload fehlgeschlagen. Bitte erneut versuchen." },
      { status: 500 },
    );
  }
}
