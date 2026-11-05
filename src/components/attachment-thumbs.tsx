import { cn } from "./ui";

export type ThumbAttachment = {
  id: string;
  status: string;
  mimeType: string | null;
  caption: string | null;
};

const isImage = (a: ThumbAttachment) =>
  Boolean(a.mimeType?.startsWith("image/")) && a.mimeType !== "image/heic";

/**
 * Reference images and files of a customer (private, served only to admin and the assigned
 * tattooer via /api/attachments). Tap opens the full picture.
 */
export function AttachmentThumbs({
  attachments,
  size = "md",
  className,
}: {
  attachments: ThumbAttachment[];
  size?: "sm" | "md";
  className?: string;
}) {
  if (!attachments.length) return null;
  return (
    <ul
      className={cn(
        "grid gap-2",
        size === "sm" ? "grid-cols-4 sm:grid-cols-5" : "grid-cols-3 sm:grid-cols-4",
        className,
      )}
    >
      {attachments.map((a) => (
        <li key={a.id} className="overflow-hidden rounded-lg border border-line bg-muted">
          {a.status !== "STORED" ? (
            <div className="flex aspect-square items-center justify-center p-1 text-center text-[11px] text-ink-soft">
              wird geladen …
            </div>
          ) : isImage(a) ? (
            <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-protected file */}
              <img
                src={`/api/attachments/${a.id}`}
                alt={a.caption ?? "Referenzbild"}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
            </a>
          ) : (
            <a
              href={`/api/attachments/${a.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex aspect-square items-center justify-center p-1 text-center text-[11px] underline"
            >
              {a.mimeType === "application/pdf" ? "PDF öffnen" : "Datei öffnen"}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
