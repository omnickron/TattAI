import type { Metadata } from "next";
import Link from "next/link";
import { Card, cn, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { ItemActions } from "./item-actions";
import { ContentUploader } from "./uploader";

export const metadata: Metadata = { title: "Content" };

const mb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Browsers can't show HEIC – a placeholder is shown instead (download still works). */
const displayable = (mime: string) => !mime.includes("heic") && !mime.includes("heif");

export default async function ContentPage({ searchParams }: PageProps<"/content">) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const params = await searchParams;
  const filter = typeof params.filter === "string" ? params.filter : "all";

  const items = await prisma.contentItem.findMany({
    where: {
      ...(isAdmin ? {} : { uploaderId: user.id }),
      ...(filter === "selected" ? { selectedForAd: true } : {}),
      ...(filter === "video"
        ? { kind: "VIDEO" as const }
        : filter === "image"
          ? { kind: "IMAGE" as const }
          : {}),
    },
    include: { uploader: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const filters = [
    { key: "all", label: "Alle" },
    { key: "image", label: "Fotos" },
    { key: "video", label: "Videos" },
    ...(isAdmin ? [{ key: "selected", label: "Für Anzeige" }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Content"
        description={
          isAdmin
            ? "Fotos und Videos des Teams – daraus entstehen neue Meta-Anzeigen. Markiere, was in die nächste Anzeige soll."
            : "Lade Fotos und Videos deiner Arbeiten hoch – daraus erstellen wir neue Meta-Anzeigen."
        }
      />
      <div className="space-y-5">
        <ContentUploader />

        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/content" : `/content?filter=${f.key}`}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                filter === f.key
                  ? "bg-ink text-paper"
                  : "text-ink-soft hover:bg-muted hover:text-ink",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-ink-soft">
              {filter === "all" ? "Noch kein Content hochgeladen." : "Nichts in dieser Auswahl."}
            </p>
          </Card>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((it) => (
              <li
                key={it.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-surface",
                  it.selectedForAd ? "border-ink" : "border-line",
                )}
              >
                <a
                  href={`/api/content/${it.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square bg-muted"
                >
                  {it.kind === "VIDEO" ? (
                    <video
                      src={`/api/content/${it.id}#t=0.1`}
                      preload="metadata"
                      muted
                      playsInline
                      className="size-full object-cover"
                    />
                  ) : displayable(it.mimeType) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/content/${it.id}`}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-xs text-ink-soft">
                      HEIC-Foto (Vorschau nicht möglich)
                    </span>
                  )}
                </a>
                <div className="space-y-1.5 p-2.5">
                  <p className="truncate text-xs text-ink-soft">
                    {it.kind === "VIDEO" ? "Video" : "Foto"} · {mb(it.sizeBytes)} ·{" "}
                    {formatDateTime(it.createdAt)}
                    {isAdmin && <span className="block truncate">von {it.uploader.name}</span>}
                  </p>
                  <ItemActions id={it.id} selected={it.selectedForAd} isAdmin={isAdmin} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
