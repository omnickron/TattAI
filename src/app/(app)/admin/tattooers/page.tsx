import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { calendarLabel, isCalendarConnected } from "@/lib/scheduling/booking";
import { formatDateTime } from "@/lib/format";
import { TATTOOER_COLORS, tattooerColor, textColorOn } from "@/lib/tattooer-colors";
import { createTattooer, setTattooerActive, updateTattooer } from "./actions";

export const metadata: Metadata = { title: "Tätowierer" };

export default async function TattooersPage() {
  await requireAdmin();
  const tattooers = await prisma.user.findMany({
    where: { role: "TATTOOER" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      tattooerProfile: {
        select: {
          id: true,
          consultationMinutes: true,
          calendarColor: true,
          googleConnectedAt: true,
          teamupConnectedAt: true,
          calendarProvider: true,
          _count: { select: { consultations: { where: { walkIn: false } } } },
        },
      },
    },
  });
  // Default colors follow the order of creation (same as in the calendar)
  const order = await prisma.tattooerProfile.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const position = new Map(order.map((p, i) => [p.id, i]));
  const colorOf = (p: { id: string; calendarColor: string | null } | null) =>
    p ? tattooerColor(p.calendarColor, position.get(p.id) ?? 0) : TATTOOER_COLORS[0].value;
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN?.trim();

  return (
    <>
      <PageHeader
        title="Tätowierer"
        description="Nur hier angelegte Konten können sich anmelden. Deaktivierte Personen bekommen keine neuen Termine."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          {tattooers.length === 0 && <EmptyState>Noch keine Tätowierer angelegt.</EmptyState>}
          {tattooers.map((t) => (
            <Card key={t.id} className={t.active ? undefined : "opacity-70"}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full ring-1 ring-line"
                  style={{ backgroundColor: colorOf(t.tattooerProfile) }}
                />
                <h2 className="font-semibold">{t.name}</h2>
                {t.active ? <Badge tone="green">aktiv</Badge> : <Badge>deaktiviert</Badge>}
                {t.tattooerProfile && isCalendarConnected(t.tattooerProfile) ? (
                  <Badge tone="blue">{calendarLabel(t.tattooerProfile)} verbunden</Badge>
                ) : (
                  <Badge tone="amber">Kalender nicht verbunden</Badge>
                )}
              </div>
              <p className="mb-3 text-xs text-ink-soft">
                {t.tattooerProfile?._count.consultations ?? 0} Beratungen · Beratungsdauer{" "}
                {t.tattooerProfile?.consultationMinutes ?? 30} Min. · Letzte Anmeldung:{" "}
                {formatDateTime(t.lastLoginAt)}
              </p>
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-ink-soft hover:text-ink">
                  Bearbeiten
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <ActionForm
                    action={updateTattooer.bind(null, t.id)}
                    className="grid gap-3 space-y-0 sm:grid-cols-2"
                  >
                    <Field label="Name" htmlFor={`name-${t.id}`}>
                      <Input id={`name-${t.id}`} name="name" defaultValue={t.name} required />
                    </Field>
                    <Field label="Google-E-Mail" htmlFor={`email-${t.id}`}>
                      <Input
                        id={`email-${t.id}`}
                        name="email"
                        type="email"
                        defaultValue={t.email}
                        required
                      />
                    </Field>
                    <fieldset className="sm:col-span-2">
                      <legend className="mb-1.5 text-sm font-medium text-ink">
                        Farbe im Kalender
                      </legend>
                      <div className="flex flex-wrap items-center gap-2">
                        {TATTOOER_COLORS.map((c) => (
                          <label key={c.value} title={c.label} className="cursor-pointer">
                            <input
                              type="radio"
                              name="calendarColor"
                              value={c.value}
                              defaultChecked={t.tattooerProfile?.calendarColor === c.value}
                              className="peer sr-only"
                            />
                            <span
                              className="flex size-8 items-center justify-center rounded-full text-sm ring-1 ring-line ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-ink peer-checked:after:content-['✓'] peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
                              style={{ backgroundColor: c.value, color: textColorOn(c.value) }}
                            />
                            <span className="sr-only">{c.label}</span>
                          </label>
                        ))}
                        <label className="cursor-pointer" title="Automatisch nach Reihenfolge">
                          <input
                            type="radio"
                            name="calendarColor"
                            value=""
                            defaultChecked={!t.tattooerProfile?.calendarColor}
                            className="peer sr-only"
                          />
                          <span className="flex h-8 items-center rounded-full px-3 text-xs text-ink-soft ring-1 ring-line ring-offset-2 ring-offset-surface peer-checked:text-ink peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                            Automatisch
                          </span>
                        </label>
                      </div>
                    </fieldset>
                    <div>
                      <Button type="submit" variant="secondary">
                        Speichern
                      </Button>
                    </div>
                  </ActionForm>
                  <ActionForm
                    action={setTattooerActive.bind(null, t.id, !t.active)}
                    confirm={t.active ? `${t.name} wirklich deaktivieren?` : undefined}
                  >
                    <Button type="submit" variant={t.active ? "danger" : "secondary"}>
                      {t.active ? "Deaktivieren" : "Aktivieren"}
                    </Button>
                  </ActionForm>
                </div>
              </details>
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <CardTitle>Neuer Tätowierer</CardTitle>
          <ActionForm action={createTattooer}>
            <Field label="Name" htmlFor="new-name">
              <Input id="new-name" name="name" required maxLength={200} />
            </Field>
            <Field
              label="Google-E-Mail"
              htmlFor="new-email"
              hint={
                domain ? `Muss auf @${domain} enden.` : "Konto, mit dem sich die Person anmeldet."
              }
            >
              <Input id="new-email" name="email" type="email" required />
            </Field>
            <Button type="submit">Anlegen</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
