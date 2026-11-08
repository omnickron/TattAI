import type { Metadata } from "next";
import { LogoMark } from "@/components/logo";
import { OPERATOR } from "@/lib/site/content";

export const metadata: Metadata = {
  title: { absolute: "NEEDL – Beratungstermine für Tattoo-Studios aus Meta-Werbung" },
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    title: "Lead aus Meta-Werbung",
    text: "Interessierte tragen sich in ein Lead-Formular auf Facebook oder Instagram ein. NEEDL übernimmt den Lead sofort – mit Kampagne, Anzeigengruppe und Anzeige.",
  },
  {
    title: "WhatsApp-Erstansprache",
    text: "Innerhalb von Minuten bekommt der Kontakt eine Nachricht über die WhatsApp Business Platform – nur mit Einwilligung aus dem Formular und mit von Meta freigegebenen Vorlagen.",
  },
  {
    title: "Chatbot bucht die Beratung",
    text: "Ein Chatbot klärt im Chat die Tattoo-Idee (Motiv, Stelle, Größe, Stil) und bucht einen freien Beratungstermin. Bei Bedarf übernimmt jederzeit ein Mensch.",
  },
  {
    title: "Faire Verteilung im Team",
    text: "Jeder Termin geht an die Tätowiererin oder den Tätowierer, die gerade frei sind und am meisten Rückstand auf den eigenen Soll-Anteil haben – transparent und einstellbar.",
  },
  {
    title: "Umsatz-Auswertung",
    text: "Nach der Beratung wird das Ergebnis eingetragen. So sieht das Studio, wie viele Leads zu Beratungen, Tattoo-Terminen und Umsatz geführt haben – je Kampagne und Person.",
  },
];

const FEATURES = [
  [
    "Kalender-Anbindung",
    "Termine landen im Google Kalender oder in TeamUp, freie Zeiten kommen aus den Verfügbarkeiten des Teams.",
  ],
  ["Erinnerungen", "Automatische WhatsApp-Erinnerungen vor dem Termin senken No-Shows."],
  [
    "Alles an einem Ort",
    "Leadliste, Chatverlauf, Tattoo-Zusammenfassung und Termine in einer App – auch mobil.",
  ],
  [
    "Datenschutz",
    "Hosting in der EU, verschlüsselte Zugangsdaten, Rollen und automatische Löschfristen.",
  ],
];

export default function StartPage() {
  return (
    <main>
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-14 sm:py-20 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-sm font-medium tracking-wide text-accent uppercase">
            Für Tattoo-Studios
          </p>
          <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">
            Aus Werbe-Leads werden Beratungstermine.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-soft">
            NEEDL holt Leads aus Meta-Werbung ab, schreibt sie per WhatsApp an, lässt einen Chatbot
            die Beratung buchen, verteilt die Termine fair auf das Team und zeigt am Ende, wie viel
            Umsatz daraus entstanden ist.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#kontakt"
              className="inline-flex items-center rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:bg-ink/85"
            >
              Kontakt aufnehmen
            </a>
            <a
              href="#so-funktionierts"
              className="inline-flex items-center rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:bg-muted"
            >
              So funktioniert’s
            </a>
          </div>
        </div>
        <LogoMark className="hidden size-56 text-ink md:block" gap="var(--paper)" title="" />
      </section>

      <section id="so-funktionierts" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="text-2xl sm:text-3xl">So funktioniert’s</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-xl border border-line bg-paper p-5">
                <span className="flex size-8 items-center justify-center rounded-full bg-ink text-sm font-medium text-paper">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14">
        <h2 className="text-2xl sm:text-3xl">Gebaut für den Studio-Alltag</h2>
        <p className="mt-3 max-w-2xl text-ink-soft">
          NEEDL ist für Studios mit mehreren Tätowiererinnen und Tätowierern ohne eigene
          Empfangskraft: Jede Person pflegt ihre Beratungszeiten selbst, der Inhaber behält den
          Überblick.
        </p>
        <dl className="mt-8 grid gap-6 sm:grid-cols-2">
          {FEATURES.map(([title, text]) => (
            <div key={title} className="border-l-2 border-accent pl-4">
              <dt className="font-medium text-ink">{title}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink-soft">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="kontakt" className="scroll-mt-4 border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="text-2xl sm:text-3xl">Kontakt</h2>
          <p className="mt-3 max-w-2xl text-ink-soft">
            Du möchtest NEEDL in deinem Studio einsetzen oder hast Fragen? Schreib uns.
          </p>
          <div className="mt-6 flex flex-col gap-2 text-sm">
            <a
              href={`mailto:${OPERATOR.email}`}
              className="text-lg font-medium text-ink underline underline-offset-4 hover:text-accent"
            >
              {OPERATOR.email}
            </a>
            <p className="text-ink-soft">
              {OPERATOR.name} · {OPERATOR.street} · {OPERATOR.city}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
