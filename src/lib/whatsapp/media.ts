/**
 * Downloads media customers send (reference images, documents) from WhatsApp
 * into private storage (MEDIA_STORAGE_DIR). Files are never publicly reachable;
 * the app serves them only to the admin and the assigned tattooer.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
export const ALLOWED_MEDIA: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
const MAX_ATTEMPTS = 5;

export interface MediaDownloader {
  download(mediaId: string): Promise<{ data: Buffer; mimeType: string }>;
}

export function mediaStorageDir(): string {
  return path.resolve(
    /* turbopackIgnore: true */ process.env.MEDIA_STORAGE_DIR || "./storage/media",
  );
}

/** Graph API: GET /{media-id} returns a short-lived URL that needs the token as well. */
export class CloudMediaDownloader implements MediaDownloader {
  constructor(private readonly opts: { accessToken: string; apiVersion: string }) {}

  async download(mediaId: string) {
    const auth = { authorization: `Bearer ${this.opts.accessToken}` };
    const metaRes = await fetch(
      `https://graph.facebook.com/${this.opts.apiVersion}/${encodeURIComponent(mediaId)}`,
      {
        headers: auth,
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!metaRes.ok) throw new Error(`Media-Info ${metaRes.status}`);
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url) throw new Error("Media-URL fehlt");
    if (meta.file_size && meta.file_size > MAX_MEDIA_BYTES) throw new Error("Datei zu groß");
    const fileRes = await fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(60_000) });
    if (!fileRes.ok) throw new Error(`Download ${fileRes.status}`);
    const data = Buffer.from(await fileRes.arrayBuffer());
    return {
      data,
      mimeType: meta.mime_type?.split(";")[0] ?? fileRes.headers.get("content-type") ?? "",
    };
  }
}

/** Development: returns a generated placeholder image. */
export class MockMediaDownloader implements MediaDownloader {
  async download() {
    const sharp = (await import("sharp")).default;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="#d9d4cb"/><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#6b6862">Referenzbild (Beispiel)</text></svg>`;
    return { data: await sharp(Buffer.from(svg)).png().toBuffer(), mimeType: "image/png" };
  }
}

export function createMediaDownloader(): MediaDownloader {
  if (process.env.WHATSAPP_MOCK === "true") return new MockMediaDownloader();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN must be set");
  return new CloudMediaDownloader({
    accessToken,
    apiVersion: process.env.WHATSAPP_API_VERSION || process.env.META_GRAPH_API_VERSION || "v23.0",
  });
}

export async function downloadPendingAttachments(
  prisma: PrismaClient,
  downloader: MediaDownloader,
  storageDir = mediaStorageDir(),
  limit = 10,
) {
  const pending = await prisma.leadAttachment.findMany({
    where: { status: "PENDING", waMediaId: { not: null } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let stored = 0;
  for (const a of pending) {
    try {
      const { data, mimeType } = await downloader.download(a.waMediaId!);
      const ext = ALLOWED_MEDIA[mimeType];
      if (!ext) throw new PermanentMediaError(`Dateityp nicht erlaubt: ${mimeType || "unbekannt"}`);
      if (data.length > MAX_MEDIA_BYTES) throw new PermanentMediaError("Datei zu groß");
      const relative = path.join(/* turbopackIgnore: true */ a.leadId, `${a.id}.${ext}`);
      await mkdir(path.join(/* turbopackIgnore: true */ storageDir, a.leadId), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(path.join(/* turbopackIgnore: true */ storageDir, relative), data, {
        mode: 0o600,
      });
      await prisma.leadAttachment.update({
        where: { id: a.id },
        data: {
          status: "STORED",
          storagePath: relative,
          mimeType,
          sizeBytes: data.length,
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      stored++;
    } catch (err) {
      const attempts = a.attempts + 1;
      const permanent = err instanceof PermanentMediaError || attempts >= MAX_ATTEMPTS;
      await prisma.leadAttachment.update({
        where: { id: a.id },
        data: {
          attempts,
          status: permanent ? "FAILED" : "PENDING",
          lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        },
      });
    }
  }
  return { stored };
}

class PermanentMediaError extends Error {}

/** Resolves a stored attachment path, refusing anything outside the storage dir. */
export function attachmentFilePath(storagePath: string, storageDir = mediaStorageDir()): string {
  const full = path.resolve(/* turbopackIgnore: true */ storageDir, storagePath);
  if (!full.startsWith(storageDir + path.sep)) throw new Error("Invalid attachment path");
  return full;
}

/** Deletes all files of a lead (GDPR deletion). */
export async function deleteLeadFiles(leadId: string, storageDir = mediaStorageDir()) {
  if (!/^[a-z0-9]+$/i.test(leadId)) return;
  await rm(path.join(/* turbopackIgnore: true */ storageDir, leadId), {
    recursive: true,
    force: true,
  });
}
