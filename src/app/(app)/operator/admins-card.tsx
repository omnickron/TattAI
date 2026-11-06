import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardTitle, Field, Input } from "@/components/ui";
import { isOperator } from "@/lib/auth/operator";
import { prisma } from "@/lib/db";
import { ActionButton } from "../admin/billing/buttons";
import { createStudioAdmin, setStudioAdminActive } from "./actions";

/** Studio admins (studio owners): add, lock and unlock. */
export async function AdminsCard({ currentUserId }: { currentUserId: string }) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      tattooerProfile: { select: { id: true } },
    },
  });

  return (
    <Card className="mb-4">
      <CardTitle>Studio-Admins</CardTitle>
      <p className="mb-4 text-sm text-ink-soft">
        Admins sehen alle Leads, Termine und Auswertungen, verwalten Tätowierer und pflegen das
        Bot-Wissen. Die Anmeldung läuft mit dem Google-Konto der eingetragenen E-Mail.
      </p>
      <ul className="mb-5 divide-y divide-line rounded-lg border border-line">
        {admins.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{a.name}</span>
              <span className="block truncate text-xs text-ink-soft">{a.email}</span>
            </span>
            {isOperator(a) && <Badge tone="violet">Betreiber</Badge>}
            {a.tattooerProfile && <Badge tone="gray">tätowiert</Badge>}
            {!a.active && <Badge tone="red">gesperrt</Badge>}
            {a.id !== currentUserId && (
              <ActionButton
                variant={a.active ? "danger" : "secondary"}
                action={setStudioAdminActive.bind(null, a.id, !a.active)}
                confirm={
                  a.active
                    ? `${a.name} sperren? Die Anmeldung ist dann nicht mehr möglich.`
                    : undefined
                }
              >
                {a.active ? "Sperren" : "Aktivieren"}
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
      <ActionForm action={createStudioAdmin} className="grid gap-3 space-y-0 sm:grid-cols-2">
        <Field label="Name" htmlFor="admin-name">
          <Input id="admin-name" name="name" required placeholder="z. B. Studio-Inhaberin" />
        </Field>
        <Field label="E-Mail (Google-Konto)" htmlFor="admin-email">
          <Input id="admin-email" name="email" type="email" required />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="tattoos" defaultChecked />
          Tätowiert selbst (bekommt Beratungen, Verfügbarkeit und Kalender)
        </label>
        <div className="sm:col-span-2">
          <Button type="submit">Admin anlegen</Button>
        </div>
      </ActionForm>
    </Card>
  );
}
