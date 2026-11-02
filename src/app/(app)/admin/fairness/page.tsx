import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { loadFairnessMembers } from "@/lib/scheduling/booking";
import { scoreMembers } from "@/lib/scheduling/fairness";
import { updateFairness } from "./actions";

export const metadata: Metadata = { title: "Fairness" };

const pct = (value: number) =>
  new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(value);

export default async function FairnessPage() {
  await requireAdmin();
  const { members, windowDays, since } = await loadFairnessMembers(prisma, new Date());
  const profiles = await prisma.tattooerProfile.findMany({
    where: { id: { in: members.map((m) => m.tattooerId) } },
    select: { id: true, googleConnectedAt: true, user: { select: { name: true, role: true } } },
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const scores = scoreMembers(members).sort((a, b) =>
    byId.get(a.tattooerId)!.user.name.localeCompare(byId.get(b.tattooerId)!.user.name, "de"),
  );
  const total = members.reduce((s, m) => s + m.count, 0);

  return (
    <>
      <PageHeader
        title="Faire Verteilung"
        description="Neue Beratungen gehen an die Person mit dem größten Rückstand gegenüber ihrem Soll-Anteil – unter allen, die zum gewünschten Zeitpunkt frei sind."
      />
      <Card>
        <ActionForm action={updateFairness}>
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-4 py-2 font-medium sm:pl-0">Tätowierer</th>
                  <th className="px-2 py-2 font-medium">Soll-Anteil</th>
                  <th className="px-2 py-2 text-right font-medium">Termine</th>
                  <th className="px-2 py-2 text-right font-medium">Ist-Anteil</th>
                  <th className="px-4 py-2 text-right font-medium sm:pr-0">Rückstand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {scores.map((s) => {
                  const p = byId.get(s.tattooerId)!;
                  return (
                    <tr key={s.tattooerId}>
                      <td className="px-4 py-2 sm:pl-0">
                        <span className="font-medium">{p.user.name}</span>{" "}
                        {p.user.role === "ADMIN" && <Badge>Inhaber</Badge>}{" "}
                        {!p.googleConnectedAt && <Badge tone="amber">ohne Kalender</Badge>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <Input
                            name={`share_${s.tattooerId}`}
                            defaultValue={Math.round(s.share * 1000) / 10}
                            inputMode="decimal"
                            className="w-20 text-right"
                            aria-label={`Soll-Anteil ${p.user.name}`}
                          />
                          <span className="text-ink-soft">%</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{s.count}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {total ? pct(s.count / total) : "–"}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums sm:pr-0 ${s.deficit > 0.5 ? "text-amber-700 dark:text-amber-400" : ""}`}
                      >
                        {s.deficit > 0 ? "+" : ""}
                        {s.deficit.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-soft">
            Werte werden beim Speichern automatisch auf 100 % normiert. Wer seltener da ist, bekommt
            einen kleineren Anteil. Rückstand = Soll-Anteil × (Termine im Zeitraum + 1) − eigene
            Termine.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field
              label="Auswertungszeitraum"
              htmlFor="windowDays"
              hint={`Rollierend: Termine ab ${formatDate(since)} (inkl. geplanter, ohne abgesagte).`}
            >
              <div className="flex items-center gap-2">
                <Input
                  id="windowDays"
                  name="windowDays"
                  type="number"
                  min={7}
                  max={365}
                  defaultValue={windowDays}
                  className="w-24"
                />
                <span className="text-sm text-ink-soft">Tage</span>
              </div>
            </Field>
            <Button type="submit">Speichern</Button>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
