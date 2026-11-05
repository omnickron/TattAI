"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cn } from "@/components/ui";

type Job = { name: string; progress: number; error?: string; done?: boolean };

function upload(file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/content/upload");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = "Upload fehlgeschlagen.";
      try {
        message = JSON.parse(xhr.responseText).error ?? message;
      } catch {}
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Keine Verbindung – bitte erneut versuchen."));
    xhr.send(file);
  });
}

/** Drag & drop or pick photos/videos; uploads one after another with progress. */
export function ContentUploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [over, setOver] = useState(false);
  const busy = jobs.some((j) => !j.done && !j.error);

  async function start(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const offset = jobs.length;
    setJobs((j) => [...j, ...list.map((f) => ({ name: f.name, progress: 0 }))]);
    for (const [i, f] of list.entries()) {
      const idx = offset + i;
      const set = (patch: Partial<Job>) =>
        setJobs((all) => all.map((j, k) => (k === idx ? { ...j, ...patch } : j)));
      try {
        await upload(f, (p) => set({ progress: p }));
        set({ progress: 1, done: true });
      } catch (err) {
        set({ error: err instanceof Error ? err.message : "Upload fehlgeschlagen." });
      }
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          start(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
          over ? "border-ink bg-muted" : "border-line bg-surface hover:bg-muted/50",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-8 text-ink-soft"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <span className="text-sm font-medium">Fotos oder Videos hochladen</span>
        <span className="text-xs text-ink-soft">
          Antippen oder hierher ziehen · Fotos bis 30 MB, Videos bis 500 MB
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) start(e.target.files);
          e.target.value = "";
        }}
      />
      {jobs.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {jobs.map((j, i) => (
            <li key={i} className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{j.name}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    j.error ? "text-red-600" : j.done ? "text-emerald-700" : "text-ink-soft",
                  )}
                >
                  {j.error ? "Fehler" : j.done ? "✓ fertig" : `${Math.round(j.progress * 100)} %`}
                </span>
              </div>
              {!j.done && !j.error && (
                <div className="mt-1.5 h-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-ink transition-[width]"
                    style={{ width: `${j.progress * 100}%` }}
                  />
                </div>
              )}
              {j.error && <p className="mt-1 text-xs text-red-600">{j.error}</p>}
            </li>
          ))}
        </ul>
      )}
      {busy && (
        <p className="text-xs text-ink-soft">
          Bitte die Seite offen lassen, bis alles hochgeladen ist.
        </p>
      )}
    </div>
  );
}
