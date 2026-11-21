"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";

/** Upload of a recorded voice memo (sent as raw body, converted on the server). */
export function VoiceMemoUploader() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/voice-memos", {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-file-name": encodeURIComponent(name.trim() || file.name.replace(/\.[^.]+$/, "")),
        },
        body: file,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ ok: false, text: json.error ?? "Upload fehlgeschlagen." });
        return;
      }
      setMessage({ ok: true, text: "Hochgeladen und umgewandelt." });
      setFile(null);
      setName("");
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Upload fehlgeschlagen. Bitte erneut versuchen." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="space-y-3">
      <div>
        <p className="mb-1.5 text-sm font-medium">Aufnahme</p>
        <label
          htmlFor="voice-file"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
          className={
            "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition hover:bg-muted " +
            (file ? "border-emerald-500/60 bg-emerald-50/50 dark:bg-emerald-950/30" : "border-line")
          }
        >
          <span aria-hidden className="text-2xl">
            🎤
          </span>
          <span className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper">
            {file ? "Andere Datei wählen" : "Aufnahme auswählen"}
          </span>
          <span className="text-sm text-ink-soft">
            {file ? (
              <>
                <span className="font-medium text-ink">{file.name}</span> ·{" "}
                {file.size < 1024 * 1024
                  ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                  : `${(file.size / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`}
              </>
            ) : (
              "oder hierher ziehen · Sprachmemo vom Handy (m4a, mp3, ogg, wav), höchstens 10 MB"
            )}
          </span>
          <input
            id="voice-file"
            type="file"
            accept="audio/*,.m4a,.mp3,.ogg,.opus,.wav,.aac"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>
      </div>
      <Field label="Name" htmlFor="voice-name" hint="Nur intern, z. B. „Begrüßung Nick“">
        <Input
          id="voice-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="Begrüßung"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!file || busy}>
          {busy ? "Wird hochgeladen …" : "Hochladen"}
        </Button>
        {message && (
          <p
            role="status"
            className={
              message.ok ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-red-600"
            }
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
