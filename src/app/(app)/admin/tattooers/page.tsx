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
import { formatDateTime } from "@/lib/format";
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
          consultationMinutes: true,
          googleConnectedAt: true,
          _count: { select: { consultations: { where: { walkIn: false } } } },
        },
      },
    },
  });
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
                <h2 className="font-semibold">{t.name}</h2>
                {t.active ? <Badge tone="green">aktiv</Badge> : <Badge>deaktiviert</Badge>}
                {t.tattooerProfile?.googleConnectedAt ? (
                  <Badge tone="blue">Kalender verbunden</Badge>
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
