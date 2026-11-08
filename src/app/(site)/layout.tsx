import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { LEGAL_NAV, OPERATOR } from "@/lib/site/content";
import { siteLinks, siteOrigin } from "@/lib/site/links";

const origin = siteOrigin();

export const metadata: Metadata = {
  // The website may be indexed (the app itself stays noindex, see the root layout)
  robots: { index: true, follow: true },
  ...(origin ? { metadataBase: new URL(origin) } : {}),
  description:
    "NEEDL bringt Tattoo-Studios Beratungstermine aus Meta-Werbung: WhatsApp-Erstansprache, Chatbot-Buchung, faire Verteilung und Umsatz-Auswertung.",
};

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const links = await siteLinks();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link href={links.home} className="text-xl text-ink" aria-label="NEEDL – Startseite">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href={links.contact}
              className="rounded-lg px-3 py-2 text-ink-soft hover:bg-muted hover:text-ink"
            >
              Kontakt
            </Link>
            <Link
              href={links.login}
              className="rounded-lg border border-line px-3 py-2 font-medium text-ink hover:bg-muted"
            >
              Anmelden
            </Link>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} NEEDL ·{" "}
            <a href={`mailto:${OPERATOR.email}`} className="hover:text-ink">
              {OPERATOR.email}
            </a>
          </p>
          <nav aria-label="Rechtliches" className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
