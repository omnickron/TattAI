import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, Card, Select } from "@/components/ui";
import { isDevLoginEnabled } from "@/lib/auth/dev-login";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { signInAsDevUser, signInWithGoogle } from "./actions";

export const metadata: Metadata = { title: "Anmelden" };

const ERRORS: Record<string, string> = {
  AccessDenied:
    "Zugriff verweigert. Dein Konto ist nicht freigeschaltet oder gehört nicht zum Studio-Workspace.",
  Configuration: "Die Anmeldung ist nicht richtig konfiguriert. Bitte den Admin informieren.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");

  const params = await searchParams;
  const error =
    typeof params.error === "string" ? (ERRORS[params.error] ?? ERRORS.AccessDenied) : null;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";
  const devUsers = isDevLoginEnabled()
    ? await prisma.user.findMany({
        where: { active: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { email: true, name: true, role: true },
      })
    : [];

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-lg font-bold text-paper">
            N
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">NEEDL</h1>
          <p className="mt-1 text-sm text-ink-soft">Leads und Beratungstermine</p>
        </div>

        <Card className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
            >
              {error}
            </p>
          )}
          <form action={signInWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <Button type="submit" className="w-full py-2.5">
              Mit Google anmelden
            </Button>
          </form>
          <p className="text-center text-xs text-ink-soft">
            Nur mit freigeschaltetem Studio-Konto möglich.
          </p>
        </Card>

        {devUsers.length > 0 && (
          <Card className="space-y-3 border-dashed">
            <div>
              <h2 className="text-sm font-semibold">Entwickler-Login</h2>
              <p className="text-xs text-ink-soft">
                Nur in der Entwicklung verfügbar. Anmeldung als Beispielnutzer ohne Google.
              </p>
            </div>
            <form action={signInAsDevUser} className="flex gap-2">
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <Select name="email" aria-label="Beispielnutzer" className="flex-1">
                {devUsers.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name} ({u.role === "ADMIN" ? "Admin" : "Tätowierer"})
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Anmelden
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
