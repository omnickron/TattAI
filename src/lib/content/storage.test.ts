import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canAccessContent, contentFilePath, MAX_BYTES, storeContentStream } from "./storage";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "needl-content-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const stream = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });

async function files(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true, recursive: true }))
    if (e.isFile()) out.push(e.name);
  return out;
}

describe("content storage", () => {
  it("streams a photo into the private folder", async () => {
    const res = await storeContentStream(stream([new Uint8Array([1, 2, 3])]), {
      mime: "image/jpeg",
      dir,
      now: new Date("2026-11-05T10:00:00Z"),
    });
    expect(res).toMatchObject({ kind: "IMAGE", sizeBytes: 3, mimeType: "image/jpeg" });
    expect(res.storagePath).toMatch(/^content\/2026\/11\/[0-9a-f-]+\.jpg$/);
    expect([...(await readFile(contentFilePath(res.storagePath, dir)))]).toEqual([1, 2, 3]);
  });

  it("rejects unsupported formats and empty files", async () => {
    await expect(
      storeContentStream(stream([new Uint8Array([1])]), { mime: "application/pdf", dir }),
    ).rejects.toMatchObject({ status: 415 });
    await expect(storeContentStream(stream([]), { mime: "video/mp4", dir })).rejects.toThrow(
      /leer/,
    );
    expect(await files(dir)).toEqual([]);
  });

  it("aborts files over the limit without leaving anything behind", async () => {
    const big = new Uint8Array(1024 * 1024);
    const chunks = Array.from({ length: MAX_BYTES.IMAGE / big.length + 1 }, () => big);
    await expect(
      storeContentStream(stream(chunks), { mime: "image/png", dir }),
    ).rejects.toMatchObject({ status: 413 });
    expect(await files(dir)).toEqual([]);
  });

  it("never resolves paths outside the storage folder", () => {
    expect(() => contentFilePath("../../etc/passwd", dir)).toThrow();
  });

  it("lets only the uploader and the admin access an item", () => {
    const item = { uploaderId: "u1" };
    expect(canAccessContent({ id: "u1", role: "TATTOOER" }, item)).toBe(true);
    expect(canAccessContent({ id: "u2", role: "TATTOOER" }, item)).toBe(false);
    expect(canAccessContent({ id: "a", role: "ADMIN" }, item)).toBe(true);
  });
});
