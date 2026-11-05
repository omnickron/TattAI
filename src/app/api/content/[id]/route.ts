import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessContent, contentFilePath } from "@/lib/content/storage";
import { prisma } from "@/lib/db";

/** Serves a content file to its uploader and the admin (with Range support for videos). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const item = await prisma.contentItem.findUnique({ where: { id } });
  if (!item || !canAccessContent(user, item)) return new Response("Not found", { status: 404 });

  let file: string;
  let size: number;
  try {
    file = contentFilePath(item.storagePath);
    size = (await stat(file)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const download = new URL(request.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "content-type": item.mimeType,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
    "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(item.originalName)}`,
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && size > 0) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end)
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": String(end - start + 1),
      },
    });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "content-length": String(size) } });
}
