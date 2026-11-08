import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CalendarCard, FairnessCard, PhoneChat, RevenueCard } from "@/components/site/mockups";
import { cn } from "@/components/ui";
import { OPERATOR, PRICING, demoMailto } from "@/lib/site/content";

export const metadata: Metadata = {
  title: { absolute: "NEEDL – Mehr Beratungstermine aus deiner Meta-Werbung" },
  alternates: { canonical: "/" },
};

/* ------------------------------------------------------------------ building blocks */

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

function Heading({
  eyebrow,
  title,
  intro,
  center,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={cn("reveal max-w-3xl", center && "mx-auto text-center")}>
      <p className="eyebrow text-[var(--accent)]">{eyebrow}</p>
      <h2 className="text-balance mt-4 text-[2rem] leading-[1.08] sm:text-5xl">{title}</h2>
      {intro && (
        <p className="mt-5 text-lg leading-relaxed text-[var(--ink-soft)] sm:text-xl">{intro}</p>
      )}
    </div>
  );
}

function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-full bg-[var(--paper)] px-6 py-3.5 text-[15px] font-semibold text-[var(--night)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
    >
      {children}
    </a>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" aria-hidden>
      <path
        d="M5 10.5l3.2 3.2L15 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ content */

const TICKER = [
  "Leads aus Meta-Werbung",
  "WhatsApp-Erstansprache",
  "Chatbot bucht Beratungen",
  "Faire Verteilung im Team",
  "Google Kalender & TeamUp",
  "Umsatz pro Kampagne",
  "Hosting in Deutschland",
];

const FACTS = [
  { value: "24/7", label: "Der Chatbot antwortet – auch nachts und am Wochenende" },
  { value: "100 %", label: "der Leads mit WhatsApp-Einwilligung werden automatisch angeschrieben" },
  { value: "0", label: "Zettel, Tabellen und Copy-Paste zwischen Apps" },
];

const PAINS = [
  {
    title: "Leads werden kalt",
    text: "Wer sich abends für ein Tattoo einträgt, ist morgen schon beim nächsten Studio. Zwischen Nadel und Kunde bleibt keine Zeit fürs Handy.",
  },
  {
    title: "Termine landen ungleich",
    text: "Ohne Empfang bucht, wer gerade Zeit hat. Das sorgt im Team für Frust – und Beratungen gehen unter.",
  },
  {
    title: "Werbung ohne Ergebnis-Blick",
    text: "Meta zeigt dir Klicks und Leads. Wie viel Tattoo-Umsatz daraus wurde, weiß am Ende niemand.",
  },
];

const STEPS = [
  {
    title: "Lead kommt rein",
    text: "Jemand trägt sich in dein Formular auf Facebook oder Instagram ein. NEEDL übernimmt den Lead sofort – mit Kampagne und Anzeige.",
  },
  {
    title: "WhatsApp geht raus",
    text: "NEEDL schreibt den Kontakt per WhatsApp an – mit seiner Einwilligung aus dem Formular und mit von Meta freigegebenen Vorlagen.",
  },
  {
    title: "Chatbot klärt die Idee",
    text: "Motiv, Körperstelle, Größe, Stil, Farbe, Cover-up, Referenzbilder: alles landet als Zusammenfassung am Lead.",
  },
  {
    title: "Beratung ist gebucht",
    text: "Der Bot bietet freie Zeiten an und bucht. Der Termin geht fair an die passende Person und steht direkt in ihrem Kalender.",
  },
  {
    title: "Du siehst, was es bringt",
    text: "Nach der Beratung trägt dein Team das Ergebnis ein. Du siehst Termine, Tattoos und Umsatz – pro Kampagne und Person.",
  },
];

const FEATURES: {
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  visual: ReactNode;
}[] = [
  {
    eyebrow: "Faire Verteilung",
    title: "Jeder bekommt seinen Anteil.",
    text: "Du legst fest, wer wie viel Prozent der Beratungen bekommt – wer seltener im Studio ist, bekommt weniger. Jeder neue Termin geht an die Person, die frei ist und den größten Rückstand hat.",
    points: [
      "Soll-Anteile pro Tätowierer, automatisch auf 100 % normiert",
      "Auswertungszeitraum einstellbar, Standard: rollierend 4 Wochen",
      "Termine bei Bedarf von Hand umverteilen",
    ],
    visual: <FairnessCard />,
  },
  {
    eyebrow: "Kalender",
    title: "Nur Zeiten, die wirklich frei sind.",
    text: "Jeder Tätowierer pflegt seine Beratungszeiten, Urlaub und Puffer selbst. NEEDL zieht belegte Zeiten aus dem Kalender ab und trägt gebuchte Termine ein – mit der Tattoo-Zusammenfassung in der Beschreibung.",
    points: [
      "Google Kalender oder TeamUp, pro Person wählbar",
      "Beratungsdauer und Puffer pro Person",
      "Gegen Doppelbuchungen abgesichert",
    ],
    visual: <CalendarCard />,
  },
  {
    eyebrow: "Auswertung",
    title: "Vom Klick bis zum Umsatz.",
    text: "Nach jeder Beratung wird eingetragen, ob ein Tattoo-Termin entstanden ist – mit Preis, Anzahlung und Endbetrag. So siehst du endlich, welche Kampagne sich wirklich lohnt.",
    points: [
      "Leads, Beratungen, Abschlüsse und Umsatz je Zeitraum",
      "Aufgeschlüsselt nach Kampagne und Tätowierer",
      "No-Shows und einbehaltene Anzahlungen werden mitgezählt",
    ],
    visual: <RevenueCard />,
  },
];

const BENTO = [
  {
    title: "Erinnerungen",
    text: "Automatische WhatsApp-Erinnerung vor der Beratung – weniger No-Shows.",
  },
  {
    title: "Übergabe an Menschen",
    text: "Wird es knifflig, übergibt der Bot – mit Hinweis in der App und Push aufs Handy.",
  },
  {
    title: "Keine Preise vom Bot",
    text: "Der Bot nennt nie Preise oder Schätzungen. Das klärt ihr in der Beratung.",
  },
  {
    title: "Bot-Wissen",
    text: "Öffnungszeiten, Anfahrt, Stile, Regeln: Du pflegst, was der Bot über dein Studio weiß.",
  },
  {
    title: "Alles am Lead",
    text: "Kontaktdaten, Chatverlauf, Zusammenfassung, Termine und Notizen auf einer Seite.",
  },
  {
    title: "Aufs Handy",
    text: "Läuft im Browser und lässt sich wie eine App auf den Homescreen legen.",
  },
];

const ROLES = [
  {
    title: "Für Inhaber",
    points: [
      "Alle Leads, Termine und Auswertungen im Blick",
      "Team anlegen und Anteile für die Verteilung setzen",
      "Bot pausieren, Wissen pflegen, Chats übernehmen",
      "Monatsrechnung transparent pro Termin",
    ],
  },
  {
    title: "Für Tätowierer",
    points: [
      "Eigene Beratungszeiten, Urlaub und Puffer pflegen",
      "Eigenen Kalender verbinden",
      "Nur die eigenen Beratungen und Leads sehen",
      "Ergebnis nach der Beratung schnell eintragen",
    ],
  },
];

const TRUST = [
  {
    title: "Hosting in Deutschland",
    text: "Server und Datenbank laufen in einem deutschen Rechenzentrum.",
  },
  {
    title: "Einwilligung dokumentiert",
    text: "Zeitpunkt und Wortlaut der WhatsApp-Einwilligung werden an jedem Lead gespeichert.",
  },
  {
    title: "Automatische Löschung",
    text: "Leads ohne Beratung oder Termin werden nach zehn Monaten ohne Aktivität gelöscht.",
  },
  {
    title: "Verschlüsselte Zugänge",
    text: "Zugangsdaten zu Kalendern und Meta werden verschlüsselt gespeichert und nie wieder angezeigt.",
  },
  {
    title: "Rollen und Rechte",
    text: "Tätowierer sehen nur ihre eigenen Kunden. Referenzbilder liegen privat, ohne öffentliche Links.",
  },
  {
    title: "Offizielle Schnittstellen",
    text: "Leads und WhatsApp laufen über die offiziellen Schnittstellen von Meta – kein Graubereich.",
  },
];

const ONBOARDING = [
  {
    title: "Kennenlernen",
    text: "Kurzes Gespräch: Wie arbeitet dein Studio, was soll NEEDL übernehmen?",
  },
  {
    title: "Verbinden",
    text: "Wir verbinden deine Facebook-Seite für die Leads und richten WhatsApp mit eigener Nummer ein.",
  },
  {
    title: "Team einrichten",
    text: "Tätowierer anlegen, Kalender verbinden, Beratungszeiten und Anteile festlegen, Bot-Wissen pflegen.",
  },
  {
    title: "Live gehen",
    text: "Kampagne starten – ab jetzt landen Beratungen direkt im Kalender.",
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Was brauche ich, um NEEDL zu nutzen?",
    a: "Eine Facebook-Seite mit Werbekonto für Lead-Formulare, eine eigene Telefonnummer für WhatsApp (getrennt von deiner Hauptnummer) und Google-Konten für dein Team zum Anmelden. Beim Einrichten helfen wir dir.",
  },
  {
    q: "Merken meine Kunden, dass ein Bot schreibt?",
    a: "Der Bot schreibt locker per „du“ und gibt sich nie als Mensch aus. Fragt jemand nach, sagt er offen, dass manche Nachrichten durch eine KI automatisiert werden.",
  },
  {
    q: "Nennt der Bot Preise?",
    a: "Nein. Der Bot nennt nie Preise, Schätzungen oder Preisrahmen. Den Preis klärt ihr persönlich in der Beratung.",
  },
  {
    q: "Kann ich jederzeit selbst übernehmen?",
    a: "Ja. Du kannst den Bot für einzelne Chats oder ganz pausieren. Wenn der Bot nicht weiterweiß, übergibt er an euch – mit Hinweis in der App und Push-Benachrichtigung.",
  },
  {
    q: "Welche Kalender werden unterstützt?",
    a: "Google Kalender und TeamUp – pro Tätowierer wählbar. Bei TeamUp reicht ein Freigabe-Link, Admin-Rechte sind nicht nötig.",
  },
  {
    q: "Wie funktioniert die faire Verteilung genau?",
    a: "Du legst für jede Person einen Soll-Anteil fest. Bei jedem neuen Termin bekommt unter allen, die zu der Zeit frei sind, die Person mit dem größten Rückstand auf ihren Anteil den Termin.",
  },
  {
    q: "Brauche ich eine App aus dem App Store?",
    a: "Nein. NEEDL läuft im Browser auf Handy, Tablet und Computer und lässt sich wie eine App auf den Homescreen legen – inklusive Push-Benachrichtigungen.",
  },
  {
    q: "Was ist mit Datenschutz?",
    a: (
      <>
        NEEDL wird in Deutschland gehostet, Einwilligungen werden dokumentiert, alte Leads
        automatisch gelöscht. Wir schließen mit dir einen Auftragsverarbeitungsvertrag. Details
        stehen in der{" "}
        <a href="/datenschutz" className="underline underline-offset-2">
          Datenschutzerklärung
        </a>
        .
      </>
    ),
  },
  {
    q: "Was kostet NEEDL?",
    a: (
      <>
        {PRICING.model}. Mehr dazu unter{" "}
        <a href="#konditionen" className="underline underline-offset-2">
          Konditionen
        </a>
        .
      </>
    ),
  },
];

/* ------------------------------------------------------------------ page */

export default function StartPage() {
  return (
    <main>
      {/* Hero */}
      <section className="night relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(180,83,42,0.28),transparent)] md:left-[70%]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pt-24 md:pb-28">
          <div className="hero-in">
            <p className="eyebrow text-[var(--ink-soft)]">Für Tattoo-Studios</p>
            <h1 className="mt-5 text-[2.6rem] leading-[1.02] uppercase sm:text-6xl lg:text-7xl">
              Mehr Termine.
              <br />
              Weniger Tippen.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--ink-soft)] sm:text-xl">
              NEEDL schreibt deine Leads aus Meta-Werbung per WhatsApp an, lässt einen Chatbot die
              Beratung buchen, verteilt die Termine fair im Team – und zeigt dir, wie viel Umsatz
              daraus wird.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <PrimaryButton href={demoMailto}>Demo anfragen</PrimaryButton>
              <a
                href="#ablauf"
                className="inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium text-[var(--paper)] ring-1 ring-white/25 transition-colors hover:bg-white/10"
              >
                So funktioniert’s
              </a>
            </div>
          </div>
          <div className="hero-in-late">
            <PhoneChat />
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
              {TICKER.map((t) => (
                <li
                  key={t}
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

      {/* Facts */}
      <section className="bg-[var(--surface)]">
        <dl className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-3 sm:px-6">
          {FACTS.map((f) => (
            <div key={f.value} className="reveal">
              <dt className="font-display text-4xl sm:text-5xl">{f.value}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{f.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Problem */}
      <Section>
        <Heading
          eyebrow="Das Problem"
          title="Jeder Lead kostet Geld. Jeder unbeantwortete verbrennt es."
          intro="Werbung bei Meta bringt Anfragen. Aber im Studio-Alltag zwischen Stencil, Nadel und Kundschaft bleibt keine Zeit, jede sofort zu beantworten."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {PAINS.map((p, i) => (
            <div key={p.title} className="reveal rounded-[1.75rem] bg-[var(--surface)] p-7">
              <p className="font-display text-sm text-[var(--accent)]">0{i + 1}</p>
              <h3 className="mt-3 text-xl">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-[var(--ink-soft)]">{p.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Process */}
      <Section id="ablauf" night>
        <div className="grid gap-12 md:grid-cols-[1fr_1.3fr] md:gap-20">
          <div className="md:sticky md:top-28 md:self-start">
            <Heading
              eyebrow="Ablauf"
              title="Vom Formular zur Beratung. Automatisch."
              intro="Fünf Schritte, um die du dich nicht mehr kümmern musst."
            />
          </div>
          <ol className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="reveal grid grid-cols-[3rem_1fr] gap-4 py-7 sm:grid-cols-[4rem_1fr]"
              >
                <span className="font-display text-2xl text-[var(--accent)] sm:text-3xl">
                  0{i + 1}
                </span>
                <div>
                  <h3 className="text-xl sm:text-2xl">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-[var(--ink-soft)]">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* Features */}
      <Section id="funktionen">
        <Heading
          eyebrow="Funktionen"
          title="Gebaut für Studios ohne Empfang."
          intro="Jeder Tätowierer führt seine Beratungen selbst. NEEDL sorgt dafür, dass die Termine kommen – und fair verteilt sind."
          center
        />
        <div className="mt-20 space-y-24 sm:space-y-32">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
              <div className={cn("reveal", i % 2 === 1 && "md:order-2")}>
                <p className="eyebrow text-[var(--accent)]">{f.eyebrow}</p>
                <h3 className="text-balance mt-3 text-3xl leading-tight sm:text-4xl">{f.title}</h3>
                <p className="mt-4 text-lg leading-relaxed text-[var(--ink-soft)]">{f.text}</p>
                <ul className="mt-6 space-y-3">
                  {f.points.map((p) => (
                    <li key={p} className="flex gap-3">
                      <Check />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="reveal rounded-[2rem] bg-[var(--muted)] p-5 sm:p-10">{f.visual}</div>
            </div>
          ))}
        </div>

        <div className="mt-28 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENTO.map((b) => (
            <div key={b.title} className="reveal rounded-[1.75rem] bg-[var(--surface)] p-7">
              <h3 className="text-lg">{b.title}</h3>
              <p className="mt-2 leading-relaxed text-[var(--ink-soft)]">{b.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Roles */}
      <section className="bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <Heading eyebrow="Für dein Team" title="Eine App, zwei Blickwinkel." center />
          <div className="mt-14 grid gap-4 md:grid-cols-2">
            {ROLES.map((r) => (
              <div key={r.title} className="reveal rounded-[1.75rem] bg-[var(--paper)] p-8">
                <h3 className="text-2xl">{r.title}</h3>
                <ul className="mt-6 space-y-3">
                  {r.points.map((p) => (
                    <li key={p} className="flex gap-3">
                      <Check />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <Section id="sicherheit" night>
        <Heading
          eyebrow="Datenschutz & Sicherheit"
          title="Kundendaten in guten Händen."
          intro="Deine Kunden vertrauen dir ihre Nummer und ihre Ideen an. NEEDL ist von Anfang an auf die DSGVO ausgelegt."
        />
        <div className="mt-14 grid gap-px overflow-hidden rounded-[1.75rem] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.map((t) => (
            <div key={t.title} className="reveal bg-[var(--night)] p-7">
              <h3 className="text-lg">{t.title}</h3>
              <p className="mt-2 leading-relaxed text-[var(--ink-soft)]">{t.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Pricing */}
      <Section id="konditionen">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <Heading
            eyebrow="Konditionen"
            title="Du zahlst für Ergebnisse."
            intro="NEEDL verdient mit, wenn aus Leads echte Tattoo-Termine werden."
          />
          <div className="reveal rounded-[2rem] bg-[var(--night)] p-8 text-[var(--paper)] sm:p-10">
            <p className="eyebrow text-[var(--night-soft)]">{PRICING.model}</p>
            <p className="font-display mt-4 text-4xl sm:text-5xl">{PRICING.rate}</p>
            <ul className="mt-8 space-y-3">
              {PRICING.details.map((d) => (
                <li key={d} className="flex gap-3">
                  <Check />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
            <div className="mt-9">
              <PrimaryButton href={demoMailto}>Konditionen besprechen</PrimaryButton>
            </div>
          </div>
        </div>
      </Section>

      {/* Onboarding */}
      <section className="bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <Heading eyebrow="Start" title="In vier Schritten startklar." center />
          <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ONBOARDING.map((o, i) => (
              <li key={o.title} className="reveal rounded-[1.75rem] bg-[var(--paper)] p-7">
                <span className="flex size-9 items-center justify-center rounded-full bg-[var(--ink)] font-display text-sm text-[var(--paper)]">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg">{o.title}</h3>
                <p className="mt-2 leading-relaxed text-[var(--ink-soft)]">{o.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <Section id="faq">
        <div className="grid gap-12 md:grid-cols-[1fr_1.6fr] md:gap-20">
          <Heading eyebrow="FAQ" title="Bevor du startest." />
          <div className="faq divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {FAQ.map((f) => (
              <details key={f.q} className="group">
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
            Bereit für volle Beratungs&shy;kalender?
          </h2>
          <p className="reveal mx-auto mt-6 max-w-xl text-lg text-[var(--ink-soft)]">
            Schreib uns – wir zeigen dir NEEDL in einer kurzen Demo und schauen gemeinsam, ob es zu
            deinem Studio passt.
          </p>
          <div className="reveal mt-10 flex flex-col items-center gap-5">
            <PrimaryButton href={demoMailto}>Demo anfragen</PrimaryButton>
            <a
              href={`mailto:${OPERATOR.email}`}
              className="text-[var(--ink-soft)] hover:text-white"
            >
              {OPERATOR.email}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
