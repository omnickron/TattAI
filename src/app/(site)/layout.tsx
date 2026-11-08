import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { siteBodyFont, siteDisplayFont } from "@/app/fonts";
import { LEGAL_NAV, OPERATOR, demoMailto } from "@/lib/site/content";
import { siteLinks, siteOrigin } from "@/lib/site/links";

const origin = siteOrigin();

export const metadata: Metadata = {
  // The website may be indexed (the app itself stays noindex, see the root layout)
  robots: { index: true, follow: true },
  ...(origin ? { metadataBase: new URL(origin) } : {}),
  description:
    "NEEDL macht aus Leads aus Meta-Werbung Beratungstermine für Tattoo-Studios: WhatsApp-Erstansprache in Minuten, Chatbot-Buchung, faire Verteilung im Team und Umsatz-Auswertung.",
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "NEEDL",
    title: "NEEDL – Mehr Beratungstermine aus deiner Meta-Werbung",
    description:
      "Leads per WhatsApp anschreiben, Beratungen automatisch buchen, fair im Team verteilen, Umsatz sehen.",
  },
};

export const viewport: Viewport = { themeColor: "#f1f1ed" };

const NAV = [
  { anchor: "funktionen", label: "Funktionen" },
  { anchor: "ablauf", label: "Ablauf" },
  { anchor: "konditionen", label: "Konditionen" },
  { anchor: "faq", label: "FAQ" },
];

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const links = await siteLinks();
  const homeBase = links.home === "/start" ? "/start" : links.home.replace(/\/$/, "");
  const anchor = (id: string) => (links.home === "/" ? `#${id}` : `${homeBase}#${id}`);

  return (
    <div
      className={`site flex min-h-dvh flex-col ${siteDisplayFont.variable} ${siteBodyFont.variable}`}
    >
      <a
        href="#inhalt"
        className="sr-only z-50 rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)] focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Zum Inhalt
      </a>
      <header className="site-header sticky top-0 z-40 border-b border-black/5">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Link
            href={links.home}
            className="text-[1.15rem] text-[var(--ink)]"
            aria-label="NEEDL – Startseite"
          >
            <Logo gap="var(--paper)" />
          </Link>
          <nav
            aria-label="Hauptnavigation"
            className="hidden items-center gap-1 text-[13px] md:flex"
          >
            {NAV.map((item) => (
              <a
                key={item.anchor}
                href={anchor(item.anchor)}
                className="rounded-full px-3 py-2 text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href={links.login}
              className="hidden rounded-full px-3 py-2 text-[13px] text-[var(--ink-soft)] hover:text-[var(--ink)] sm:inline-flex"
            >
              Anmelden
            </Link>
            <a
              href={demoMailto}
              className="inline-flex items-center rounded-full bg-[var(--ink)] px-4 py-2 text-[13px] font-medium text-[var(--paper)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Demo anfragen
            </a>
          </div>
        </div>
      </header>

      <div id="inhalt" className="flex-1">
        {children}
      </div>

      <footer className="night">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">
            <div className="max-w-sm">
              <Logo className="text-2xl" gap="var(--night)" />
              <p className="mt-4 text-sm leading-relaxed text-[var(--ink-soft)]">
                Mehr Beratungstermine aus deiner Meta-Werbung – für Tattoo-Studios. Entwickelt und
                gehostet in Deutschland.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-10 text-sm sm:gap-16">
              <nav aria-label="Seite">
                <p className="eyebrow mb-4 text-[var(--ink-soft)]">NEEDL</p>
                <ul className="space-y-2.5">
                  {NAV.map((item) => (
                    <li key={item.anchor}>
                      <a href={anchor(item.anchor)} className="hover:text-white">
                        {item.label}
                      </a>
                    </li>
                  ))}
                  <li>
                    <Link href={links.login} className="hover:text-white">
                      Anmelden
                    </Link>
                  </li>
                </ul>
              </nav>
              <nav aria-label="Rechtliches">
                <p className="eyebrow mb-4 text-[var(--ink-soft)]">Rechtliches</p>
                <ul className="space-y-2.5">
                  {LEGAL_NAV.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="hover:text-white">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>
          <div className="mt-12 flex flex-col gap-2 border-t border-[var(--line)] pt-6 text-xs text-[var(--ink-soft)] sm:flex-row sm:justify-between">
            <p>© {new Date().getFullYear()} NEEDL</p>
            <a href={`mailto:${OPERATOR.email}`} className="hover:text-white">
              {OPERATOR.email}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
