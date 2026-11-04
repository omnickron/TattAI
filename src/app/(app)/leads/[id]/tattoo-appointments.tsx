import { TattooSessions, type TattooSession } from "@/components/tattoo-sessions";
import { Badge, Card, CardTitle } from "@/components/ui";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { formatEuro } from "@/lib/outcomes/money";

type Project = {
  id: string;
  status: string;
  startsAt: Date;
  tattooerId: string;
  tattooBooked: boolean | null;
  walkIn: boolean;
  sessionPlan: "SINGLE" | "MULTIPLE" | null;
  furtherSessionsScheduled: boolean | null;
  tattooer: { calendarProvider?: "GOOGLE" | "TEAMUP"; user: { name: string } };
  tattooBookings: TattooSession[];
};

function planLabel(p: Project) {
  // A single appointment is obvious from the list itself.
  if (p.sessionPlan === "SINGLE") return null;
  if (p.sessionPlan === "MULTIPLE") {
    return p.furtherSessionsScheduled
      ? "Mehrere Termine · weitere vergeben"
      : "Mehrere Termine · erst der erste vergeben";
  }
  return null;
}

/** Overview of booked tattoo appointments of a lead (one block per booked tattoo). */
export function TattooAppointments({
  user,
  consultations,
}: {
  user: CurrentUser;
  consultations: Project[];
}) {
  const projects = consultations.filter((c) => c.status === "HELD" && c.tattooBooked === true);
  if (!projects.length) return null;
  const now = new Date();
  const total = projects
    .flatMap((p) => p.tattooBookings)
    .filter((s) => !s.cancelled)
    .reduce((sum, s) => sum + (s.amountCents ?? 0), 0);

  return (
    <Card id="tattoo-termine">
      <CardTitle
        action={
          projects.length > 1 ? (
            <span className="text-sm font-semibold">{formatEuro(total)}</span>
          ) : undefined
        }
      >
        Tattoo-Termine
      </CardTitle>
      <div className="space-y-5">
        {projects.map((p) => {
          const plan = planLabel(p);
          const canEdit = user.role === "ADMIN" || p.tattooerId === user.tattooerProfile?.id;
          return (
            <section key={p.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Tattoo bei {p.tattooer.user.name}</span>
                {plan && <Badge tone="violet">{plan}</Badge>}
                {p.walkIn ? (
                  <Badge tone="amber">Laufkunde · ohne Beratung</Badge>
                ) : (
                  <span className="text-xs text-ink-soft">
                    aus der Beratung vom {formatDate(p.startsAt)}
                  </span>
                )}
              </div>
              <TattooSessions
                consultationId={p.id}
                sessions={p.tattooBookings}
                now={now}
                canEdit={canEdit}
                calendarName={p.tattooer.calendarProvider === "TEAMUP" ? "TeamUp" : "Google"}
              />
            </section>
          );
        })}
      </div>
    </Card>
  );
}
