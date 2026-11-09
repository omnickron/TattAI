import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FullCalendar } from "@/components/site/full-calendar";
import { cn } from "@/components/ui";
import { OPERATOR, PRICING, contactMailto } from "@/lib/site/content";

export const metadata: Metadata = {
  title: { absolute: "NEEDL – Wir füllen den Kalender deines Tattoo-Studios" },
  alternates: { canonical: "/" },
};

/*
 * Result-only marketing: what the studio gets (booked consultations) and how it pays
 * (commission). Deliberately no description of processes, channels or technology.
 */

function Section({
  id,
  night,
  className,
  children,
}: {
  id?: string;
  night?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-16", night && "night", className)}>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">{children}</div>
    </section>
  );
}

function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-full bg-[var(--paper)] px-7 py-3.5 text-[15px] font-semibold text-[var(--night)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
    >
      {children}
    </a>
  );
}

const TICKER = [
  "Volle Kalender",
  "Neue Beratungstermine",
  "Provisionsbasiert",
  "Für Tattoo-Studios",
  "Mehr Zeit fürs Tätowieren",
];

const PROMISES = [
  {
    title: "Mehr Termine",
    text: "Wir bringen dir neue Kundinnen und Kunden, die ein Tattoo wollen – als Beratungstermin direkt in deinem Kalender.",
  },
  {
    title: "Kein Mehraufwand",
    text: "Du musst dich um nichts kümmern. Dein Team macht, was es am besten kann: tätowieren.",
  },
  {
    title: "Volle Transparenz",
    text: "Du siehst jederzeit, welche Termine von uns kommen und was daraus geworden ist.",
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Was kostet NEEDL?",
    a: "Wir arbeiten provisionsbasiert: Du zahlst eine Provision auf den Tattoo-Umsatz, der aus unseren Terminen entsteht. Die Details besprechen wir im ersten Gespräch.",
  },
  {
    q: "Für welche Studios ist das?",
    a: "Für Tattoo-Studios, die mehr Beratungen und mehr Tattoo-Termine wollen und freie Zeiten im Kalender haben.",
  },
  {
    q: "Was muss ich tun?",
    a: "Schreib uns. Wir melden uns für ein kurzes Gespräch und schauen gemeinsam, ob wir zu deinem Studio passen.",
  },
];

export default function StartPage() {
  return (
    <main>
      {/* Hero */}
      <section className="night relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(180,83,42,0.28),transparent)] md:left-[72%]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pt-24 md:pb-28">
          <div className="hero-in">
            <p className="eyebrow text-[var(--night-soft)]">Für Tattoo-Studios</p>
            <h1 className="mt-5 text-[2.6rem] leading-[1.02] uppercase sm:text-6xl lg:text-7xl">
              Wir füllen deinen Kalender.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--night-soft)] sm:text-xl">
              NEEDL bringt deinem Studio neue Beratungstermine. Und wir verdienen erst, wenn du
              verdienst.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <PrimaryButton href={contactMailto}>Termine anfragen</PrimaryButton>
              <a
                href="#provision"
                className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-[15px] font-medium text-[var(--paper)] ring-1 ring-white/25 transition-colors hover:bg-white/10"
              >
                Wie wir abrechnen
              </a>
            </div>
          </div>
          <div className="hero-in-late">
            <FullCalendar />
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div
        className="overflow-hidden border-b border-[var(--line)] bg-[var(--paper)] py-4"
        aria-hidden
      >
        <div className="ticker">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center">
              {[...TICKER, ...TICKER].map((t, i) => (
                <li
                  key={`${t}-${i}`}
                  className="flex items-center text-sm whitespace-nowrap text-[var(--ink-soft)]"
                >
                  <span className="px-6">{t}</span>
                  <span className="text-[var(--accent)]">●</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {/* Promise */}
      <Section>
        <div className="reveal mx-auto max-w-3xl text-center">
          <p className="eyebrow text-[var(--accent)]">Das Ergebnis</p>
          <h2 className="text-balance mt-4 text-[2rem] leading-[1.08] sm:text-5xl">
            Du tätowierst. Wir sorgen für die Termine.
          </h2>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {PROMISES.map((p, i) => (
            <div key={p.title} className="reveal rounded-[1.75rem] bg-[var(--surface)] p-8">
              <p className="font-display text-sm text-[var(--accent)]">0{i + 1}</p>
              <h3 className="mt-3 text-2xl">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-[var(--ink-soft)]">{p.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Commission */}
      <Section id="provision" night>
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-20">
          <div className="reveal">
            <p className="eyebrow text-[var(--accent)]">Provisionsbasiert</p>
            <h2 className="text-balance mt-4 text-[2.2rem] leading-[1.05] uppercase sm:text-6xl">
              Kein Tattoo, keine Provision.
            </h2>
          </div>
          <div className="reveal">
            <p className="text-xl leading-relaxed text-[var(--night-soft)] sm:text-2xl">
              Wir verdienen an dem Tattoo-Umsatz, der aus unseren Terminen entsteht. So haben wir
              dasselbe Ziel wie du: einen vollen Kalender mit Kunden, die wirklich tätowiert werden
              wollen.
            </p>
            {PRICING.rate && (
              <p className="font-display mt-8 text-5xl">
                {PRICING.rate}
                <span className="ml-3 align-middle text-base font-normal text-[var(--night-soft)]">
                  Provision
                </span>
              </p>
            )}
            <div className="mt-10">
              <PrimaryButton href={contactMailto}>Gespräch vereinbaren</PrimaryButton>
            </div>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq">
        <div className="grid gap-12 md:grid-cols-[1fr_1.6fr] md:gap-20">
          <div className="reveal">
            <p className="eyebrow text-[var(--accent)]">FAQ</p>
            <h2 className="mt-4 text-[2rem] leading-[1.08] sm:text-5xl">Kurz gefragt.</h2>
          </div>
          <div className="faq divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary className="flex items-center justify-between gap-6 py-5 text-lg font-medium">
                  {f.q}
                  <span
                    aria-hidden
                    className="faq-icon flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-xl leading-none"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-6 leading-relaxed text-[var(--ink-soft)]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      {/* Contact */}
      <section id="kontakt" className="night scroll-mt-16">
        <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 sm:py-32">
          <h2 className="text-balance reveal text-[2.4rem] leading-[1.05] uppercase sm:text-6xl">
            Bereit für einen vollen Kalender?
          </h2>
          <p className="reveal mx-auto mt-6 max-w-xl text-lg text-[var(--night-soft)]">
            Schreib uns – wir melden uns für ein kurzes Gespräch.
          </p>
          <div className="reveal mt-10 flex flex-col items-center gap-5">
            <PrimaryButton href={contactMailto}>Termine anfragen</PrimaryButton>
            <a
              href={`mailto:${OPERATOR.email}`}
              className="text-[var(--night-soft)] hover:text-white"
            >
              {OPERATOR.email}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
