import { cn } from "@/components/ui";

/*
 * Illustration of the result: a fully booked week of consultations. Pure HTML/CSS,
 * sample times only – it shows the outcome, not how it is achieved.
 */
const WEEK = [
  { day: "Mo", slots: ["10:00", "12:00", "14:30", "17:00"] },
  { day: "Di", slots: ["11:00", "13:30", "16:00"] },
  { day: "Mi", slots: ["10:00", "12:30", "15:00", "17:30"] },
  { day: "Do", slots: ["11:30", "14:30", "16:00"] },
  { day: "Fr", slots: ["10:00", "11:00", "13:00", "15:30"] },
  { day: "Sa", slots: ["11:00", "13:00"] },
];

export function FullCalendar({ className }: { className?: string }) {
  const total = WEEK.reduce((n, d) => n + d.slots.length, 0);
  return (
    <div
      role="img"
      aria-label={`Beispiel: ein voller Kalender mit ${total} Beratungsterminen in einer Woche`}
      className={cn(
        "rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)] sm:p-6",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <span className="text-sm font-semibold text-[var(--paper)]">Beratungen · diese Woche</span>
        <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-semibold text-white">
          ausgebucht
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
        {WEEK.map((d) => (
          <div key={d.day} className="min-w-0">
            <p className="mb-2 text-center text-[11px] font-medium text-[var(--night-soft)]">
              {d.day}
            </p>
            <div className="flex flex-col gap-1.5">
              {d.slots.map((t) => (
                <span
                  key={t}
                  className="rounded-lg bg-[var(--paper)] px-1 py-2 text-center text-[10.5px] leading-tight font-medium text-[var(--night)] tabular-nums sm:text-[12px]"
                >
                  {t}
                  <span className="hidden text-[10px] font-normal text-[#55575d] sm:block">
                    Beratung
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 px-1 text-[12px] text-[var(--night-soft)]">
        {total} neue Beratungen · Beispiel
      </p>
    </div>
  );
}
