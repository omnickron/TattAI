/**
 * Content uploads (photos/videos for Meta ads): private files in MEDIA_STORAGE_DIR/content.
 * Only the uploader and the admin can see a file; nothing is served publicly.
 */
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { attachmentFilePath, mediaStorageDir } from "../whatsapp/media";

export const CONTENT_TYPES: Record<string, { kind: "IMAGE" | "VIDEO"; ext: string }> = {
  "image/jpeg": { kind: "IMAGE", ext: "jpg" },
  "image/png": { kind: "IMAGE", ext: "png" },
  "image/webp": { kind: "IMAGE", ext: "webp" },
  "image/heic": { kind: "IMAGE", ext: "heic" },
  "image/heif": { kind: "IMAGE", ext: "heif" },
  "video/mp4": { kind: "VIDEO", ext: "mp4" },
  "video/quicktime": { kind: "VIDEO", ext: "mov" },
  "video/webm": { kind: "VIDEO", ext: "webm" },
};

export const MAX_BYTES = { IMAGE: 30 * 1024 * 1024, VIDEO: 500 * 1024 * 1024 } as const;

export class ContentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ContentError";
  }
}

export function contentTypeOf(mime: string) {
  return CONTENT_TYPES[mime.toLowerCase().split(";")[0].trim()] ?? null;
}

export function contentFilePath(storagePath: string, dir = mediaStorageDir()) {
  return attachmentFilePath(storagePath, dir);
}

/**
 * Streams an upload to disk (never fully into memory). Writes to a temp file first and
 * renames it at the end, so a broken upload leaves nothing behind.
 */
export async function storeContentStream(
  body: WebReadableStream<Uint8Array> | ReadableStream<Uint8Array>,
  opts: { mime: string; dir?: string; now?: Date },
): Promise<{ storagePath: string; sizeBytes: number; kind: "IMAGE" | "VIDEO"; mimeType: string }> {
  const type = contentTypeOf(opts.mime);
  if (!type)
    throw new ContentError(
      "Dieses Dateiformat wird nicht unterstützt (Fotos: JPG, PNG, HEIC, WebP · Videos: MP4, MOV, WebM).",
      415,
    );
  const max = MAX_BYTES[type.kind];
  const dir = opts.dir ?? mediaStorageDir();
  const now = opts.now ?? new Date();
  const rel = path.join(
    "content",
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${randomUUID()}.${type.ext}`,
  );
  const full = contentFilePath(rel, dir);
  await mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.part`;
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > max)
        cb(new ContentError(`Datei zu groß (höchstens ${Math.round(max / 1024 / 1024)} MB).`, 413));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(body as WebReadableStream<Uint8Array>),
      limiter,
      createWriteStream(tmp, { mode: 0o600 }),
    );
    if (size === 0) throw new ContentError("Die Datei ist leer.");
    await rename(tmp, full);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  return {
    storagePath: rel,
    sizeBytes: size,
    kind: type.kind,
    mimeType: opts.mime.split(";")[0].trim().toLowerCase(),
  };
}

export async function deleteContentFile(storagePath: string, dir = mediaStorageDir()) {
  await rm(contentFilePath(storagePath, dir), { force: true });
}

/** Only the uploader and the admin may see/delete an item. */
export function canAccessContent(
  user: { id: string; role: string },
  item: { uploaderId: string },
): boolean {
  return user.role === "ADMIN" || item.uploaderId === user.id;
}
