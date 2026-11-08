import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { cn } from "@/components/ui";

/*
 * Product illustrations for the website, drawn in HTML/CSS (no images: sharp on every
 * screen and only a few kB). All names and numbers are sample data.
 */

type Bubble = { from: "studio" | "customer"; text: ReactNode; time: string };

const CHAT: Bubble[] = [
  {
    from: "studio",
    text: "Hey Lena! Danke für deine Anfrage 🖤 Erzähl mal: Was für ein Tattoo schwebt dir vor?",
    time: "18:02",
  },
  { from: "customer", text: "Eine feine Rose mit Schriftzug am Unterarm 🌹", time: "18:05" },
  {
    from: "studio",
    text: "Schöne Idee! Eher filigran in Schwarz-Grau oder mit Farbe? Und ungefähr wie groß?",
    time: "18:05",
  },
  { from: "customer", text: "Schwarz-grau, so 12 cm", time: "18:06" },
  {
    from: "studio",
    text: (
      <>
        Perfekt. Für die kostenlose Beratung hätte ich <b>Do., 14:30</b> oder <b>Fr., 11:00</b> frei
        – was passt dir?
      </>
    ),
    time: "18:06",
  },
  { from: "customer", text: "Freitag 11 Uhr 👍", time: "18:07" },
];

export function PhoneChat({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto w-[18.5rem] rounded-[3rem] bg-[#1c1c1e] p-2.5 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] ring-1 ring-white/10",
        className,
      )}
      role="img"
      aria-label="Beispiel: WhatsApp-Chat, in dem der Chatbot die Tattoo-Idee klärt und eine Beratung bucht"
    >
      <div className="overflow-hidden rounded-[2.4rem] bg-[#efeae2]">
        <div className="flex items-center gap-2.5 bg-[#f7f7f7] px-4 pt-7 pb-2.5 text-[#17181a]">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#17181a] text-[#f1f1ed]">
            <LogoMark className="size-5" gap="#17181a" title="" />
          </span>
          <span className="leading-tight">
            <span className="block text-[13px] font-semibold">Dein Studio</span>
            <span className="block text-[11px] text-[#667781]">online</span>
          </span>
        </div>
        <div className="flex flex-col gap-1.5 px-3 py-3 text-[12.5px] leading-snug text-[#111b21]">
          {CHAT.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-lg px-2.5 py-1.5 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]",
                m.from === "customer" ? "self-end bg-[#d9fdd3]" : "self-start bg-white",
              )}
            >
              {m.text}
              <span className="ml-2 align-bottom text-[10px] text-[#667781]">{m.time}</span>
            </div>
          ))}
          <div className="self-start rounded-lg bg-white px-2.5 py-2 text-[12.5px] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
            <span className="mb-1 block font-semibold">✅ Beratung gebucht</span>
            Fr., 11:00 Uhr · Dein Studio
            <br />
            Wir erinnern dich vorher noch mal.
          </div>
          <div
            className="typing flex gap-1 self-end rounded-lg bg-[#d9fdd3] px-3 py-2.5"
            aria-hidden
          >
            <span className="size-1.5 rounded-full bg-[#667781]" />
            <span className="size-1.5 rounded-full bg-[#667781]" />
            <span className="size-1.5 rounded-full bg-[#667781]" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Rounded "window" for app illustrations. */
export function AppCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] border border-black/5 bg-white p-5 text-[#17181a] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)] sm:p-6",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        <span className="rounded-full bg-[#f1f1ed] px-2.5 py-1 text-[11px] text-[#55575d]">
          Beispiel
        </span>
      </div>
      {children}
    </div>
  );
}

const TEAM = [
  { name: "Mia", target: 35, actual: 33 },
  { name: "Jonas", target: 30, actual: 31 },
  { name: "Lena", target: 20, actual: 22 },
  { name: "Can", target: 15, actual: 14 },
];

export function FairnessCard({ className }: { className?: string }) {
  return (
    <AppCard title="Verteilung · letzte 4 Wochen" className={className}>
      <ul className="space-y-4" aria-label="Soll- und Ist-Anteile je Tätowierer (Beispiel)">
        {TEAM.map((t) => (
          <li key={t.name}>
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="font-medium">{t.name}</span>
              <span className="text-[#55575d] tabular-nums">
                {t.actual} % <span className="text-[#9a9b95]">/ Soll {t.target} %</span>
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-[#ecebe6]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#17181a]"
                style={{ width: `${t.actual * 2}%` }}
              />
              <div
                className="absolute -top-1 h-4 w-0.5 rounded bg-[#b4532a]"
                style={{ left: `${t.target * 2}%` }}
                title="Soll-Anteil"
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[12px] text-[#55575d]">
        Nächster Termin geht an: <b className="text-[#17181a]">Mia</b> (größter Rückstand, frei)
      </p>
    </AppCard>
  );
}

const FUNNEL = [
  { label: "Leads", value: "128", width: 100 },
  { label: "Beratungen gebucht", value: "61", width: 48 },
  { label: "Beratungen erfolgt", value: "52", width: 41 },
  { label: "Tattoo-Termine", value: "31", width: 24 },
];

export function RevenueCard({ className }: { className?: string }) {
  return (
    <AppCard title="Auswertung · Oktober" className={className}>
      <div className="mb-5">
        <p className="text-[12px] text-[#55575d]">Tattoo-Umsatz aus Leads</p>
        <p className="font-display text-3xl tabular-nums">18.420 €</p>
      </div>
      <ul className="space-y-2.5" aria-label="Vom Lead zum Tattoo (Beispiel)">
        {FUNNEL.map((f) => (
          <li key={f.label} className="text-[13px]">
            <div className="mb-1 flex justify-between">
              <span>{f.label}</span>
              <span className="font-medium tabular-nums">{f.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#ecebe6]">
              <div className="h-full rounded-full bg-[#17181a]" style={{ width: `${f.width}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </AppCard>
  );
}

const SLOTS = [
  { day: "Mo", items: ["10:00", "14:30"] },
  { day: "Di", items: ["11:00"] },
  { day: "Mi", items: [] },
  { day: "Do", items: ["14:30", "16:00"] },
  { day: "Fr", items: ["11:00"] },
];

export function CalendarCard({ className }: { className?: string }) {
  return (
    <AppCard title="Beratungen · KW 46" className={className}>
      <div className="grid grid-cols-5 gap-2 text-center text-[12px]">
        {SLOTS.map((d) => (
          <div key={d.day}>
            <p className="mb-2 font-medium text-[#55575d]">{d.day}</p>
            <div className="flex min-h-24 flex-col gap-1.5 rounded-xl bg-[#f6f6f3] p-1.5">
              {d.items.map((t, i) => (
                <span
                  key={t}
                  className={cn(
                    "rounded-lg px-1 py-1.5 tabular-nums",
                    d.day === "Fr" || i === 1
                      ? "bg-[#17181a] text-white"
                      : "bg-white ring-1 ring-black/5",
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-2 text-[12px] text-[#55575d]">
        <span className="size-2 rounded-full bg-[#17181a]" /> gebucht
        <span className="ml-3 size-2 rounded-full bg-white ring-1 ring-black/15" /> frei
        <span className="ml-auto">Google · TeamUp</span>
      </p>
    </AppCard>
  );
}
