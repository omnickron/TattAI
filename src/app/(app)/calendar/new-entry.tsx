"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  startTransition,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Button, cn, Input, Select, Textarea, TimeSelect } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import {
  createCalendarEntryAction,
  deleteBlockerAction,
  searchLeadsAction,
  type LeadOption,
} from "./actions";

type EntryType = "consultation" | "tattoo" | "blocker";
type Defaults = { date: string; minute: number };
type Tattooer = { id: string; name: string; consultationMinutes: number };

const Ctx = createContext<{ open: (d: Defaults) => void; toast: (m: string) => void } | null>(null);

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const roundQuarter = (m: number) => Math.max(0, Math.min(23 * 60 + 45, Math.floor(m / 15) * 15));

/** Holds the dialog state for creating calendar entries. */
export function NewEntryProvider({
  children,
  isAdmin,
  tattooers,
  defaultTattooerId,
}: {
  children: ReactNode;
  isAdmin: boolean;
  tattooers: Tattooer[];
  defaultTattooerId: string | null;
}) {
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <Ctx value={{ open: setDefaults, toast: setMessage }}>
      {children}
      {defaults && (
        <EntryDialog
          defaults={defaults}
          isAdmin={isAdmin}
          tattooers={tattooers}
          defaultTattooerId={defaultTattooerId}
          onClose={() => setDefaults(null)}
          onDone={(m) => {
            setDefaults(null);
            setMessage(m);
          }}
        />
      )}
      {message && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-lg bg-ink px-4 py-2 text-sm text-paper shadow-lg"
        >
          {message}
        </div>
      )}
    </Ctx>
  );
}

function useNewEntry() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("NewEntryProvider missing");
  return ctx;
}

/** Invisible layer in a day column: a click opens the dialog at that time. */
export function ClickLayer({
  day,
  startHour,
  pxPerMin,
}: {
  day: string;
  startHour: number;
  pxPerMin: number;
}) {
  const { open } = useNewEntry();
  return (
    <button
      type="button"
      aria-label={`Neuen Termin am ${day} anlegen`}
      className="absolute inset-0 cursor-cell focus-visible:outline-2 focus-visible:outline-ink"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const minute = startHour * 60 + (e.clientY - rect.top) / pxPerMin;
        open({ date: day, minute: roundQuarter(minute) });
      }}
    />
  );
}

/** "+ Termin" button (mobile, and as an alternative to clicking the grid). */
export function AddEntryButton({ date, className }: { date: string; className?: string }) {
  const { open } = useNewEntry();
  return (
    <Button
      type="button"
      className={className}
      onClick={() => {
        const now = new Date();
        open({ date, minute: roundQuarter(now.getHours() * 60 + now.getMinutes() + 15) });
      }}
    >
      + Termin
    </Button>
  );
}

/** Blocker in the calendar: click to delete. */
export function BlockerChip({
  id,
  canDelete,
  className,
  style,
  children,
}: {
  id: string;
  canDelete: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const { toast } = useNewEntry();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={!canDelete || pending}
      title={canDelete ? "Klicken zum Löschen" : undefined}
      className={cn("text-left disabled:cursor-default", className)}
      style={style}
      onClick={() => {
        if (!window.confirm("Blocker löschen?")) return;
        start(async () => {
          const res = await deleteBlockerAction(id);
          toast(res?.message ?? "Gelöscht");
          router.refresh();
        });
      }}
    >
      {children}
    </button>
  );
}

function LeadPicker({
  type,
  tattooerId,
  allowNew,
}: {
  type: "consultation" | "tattoo";
  tattooerId: string | null;
  allowNew: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadOption[]>([]);
  const [selected, setSelected] = useState<LeadOption | null>(null);
  const [project, setProject] = useState<string>("");
  const [createNew, setCreateNew] = useState(false);
  const [loading, start] = useTransition();

  useEffect(() => {
    if (selected || createNew) return;
    const t = setTimeout(() => {
      start(async () => setResults(await searchLeadsAction(query, type, tattooerId)));
    }, 200);
    return () => clearTimeout(t);
  }, [query, type, tattooerId, selected, createNew]);

  if (createNew) {
    return (
      <div className="space-y-2 rounded-lg border border-line p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Neuer Kontakt</p>
          <button
            type="button"
            className="text-xs text-ink-soft underline"
            onClick={() => setCreateNew(false)}
          >
            Bestehenden suchen
          </button>
        </div>
        <Input name="newName" placeholder="Name" required autoFocus />
        <Input name="newPhone" type="tel" placeholder="Telefon (optional)" />
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg border border-ink px-3 py-2">
          <span>
            <span className="font-medium">{selected.name}</span>
            <span className="ml-2 text-xs text-ink-soft">{selected.phone ?? ""}</span>
          </span>
          <button
            type="button"
            className="text-xs text-ink-soft underline"
            onClick={() => {
              setSelected(null);
              setProject("");
            }}
          >
            Ändern
          </button>
        </div>
        <input type="hidden" name="leadId" value={selected.id} />
        {type === "tattoo" &&
          (selected.projects.length > 1 ? (
            <Select
              name="consultationId"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              required
            >
              <option value="" disabled>
                Welches Tattoo?
              </option>
              {selected.projects.map((p) => (
                <option key={p.consultationId} value={p.consultationId}>
                  {p.label}
                </option>
              ))}
            </Select>
          ) : (
            <input
              type="hidden"
              name="consultationId"
              value={selected.projects[0]?.consultationId ?? ""}
            />
          ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          type === "tattoo" ? "Kontakt mit gebuchtem Tattoo suchen …" : "Name oder Telefon suchen …"
        }
        aria-label="Kontakt suchen"
        autoFocus
      />
      <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {results.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => setSelected(r)}
            >
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-ink-soft">{r.phone ?? r.status}</span>
            </button>
          </li>
        ))}
        {!loading && results.length === 0 && (
          <li className="px-3 py-2 text-sm text-ink-soft">
            {type === "tattoo"
              ? "Kein Kontakt mit gebuchtem Tattoo gefunden."
              : "Kein Kontakt gefunden."}
          </li>
        )}
        {loading && <li className="px-3 py-2 text-sm text-ink-soft">Suche …</li>}
      </ul>
      {allowNew && (
        <button
          type="button"
          className="text-sm font-medium underline underline-offset-2"
          onClick={() => setCreateNew(true)}
        >
          + Neuen Kontakt anlegen
        </button>
      )}
    </div>
  );
}

function EntryDialog({
  defaults,
  isAdmin,
  tattooers,
  defaultTattooerId,
  onClose,
  onDone,
}: {
  defaults: Defaults;
  isAdmin: boolean;
  tattooers: Tattooer[];
  defaultTattooerId: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<EntryType>("consultation");
  const [walkIn, setWalkIn] = useState(false);
  // The person follows from the booked tattoo – except for walk-ins
  const personFromTattoo = type === "tattoo" && !walkIn;
  const [tattooerId, setTattooerId] = useState(
    defaultTattooerId ?? (isAdmin ? "" : (tattooers[0]?.id ?? "")),
  );
  const [start, setStart] = useState(hhmm(defaults.minute));
  const [end, setEnd] = useState(hhmm(Math.min(defaults.minute + 60, 23 * 60 + 45)));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createCalendarEntryAction,
    null,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const duration = tattooers.find((t) => t.id === tattooerId)?.consultationMinutes;

  useEffect(() => {
    if (state?.ok) {
      onDone(state.message);
      router.refresh();
    }
  }, [state, onDone, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const types: Array<{ key: EntryType; label: string }> = [
    { key: "consultation", label: "Beratung" },
    { key: "tattoo", label: "Tattoo" },
    { key: "blocker", label: "Blocker" },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-entry-title"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="new-entry-title" className="text-lg font-semibold">
            Neuer Termin
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-md px-2 py-1 text-ink-soft hover:bg-muted"
          >
            ✕
          </button>
        </div>

        <div
          className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
          role="tablist"
          aria-label="Art"
        >
          {types.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={type === t.key}
              onClick={() => setType(t.key)}
              className={cn(
                "rounded-md py-1.5 text-sm font-medium",
                type === t.key ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            // Submit without React's automatic form reset, so entries survive an error message.
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
        >
          <input type="hidden" name="type" value={type} />
          {isAdmin && (
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Für wen?</span>
              <Select
                name="tattooerId"
                value={tattooerId}
                onChange={(e) => setTattooerId(e.target.value)}
                required={!personFromTattoo}
              >
                <option value="" disabled={!personFromTattoo}>
                  {personFromTattoo ? "Alle (ergibt sich aus dem Tattoo)" : "Person auswählen …"}
                </option>
                {tattooers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <div
            className={cn("grid gap-2", type === "consultation" ? "grid-cols-2" : "grid-cols-3")}
          >
            <label className="space-y-1.5 text-sm font-medium">
              <span>Datum</span>
              <Input type="date" name="date" defaultValue={defaults.date} required />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Beginn</span>
              <TimeSelect
                name="start"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            {type !== "consultation" && (
              <label className="space-y-1.5 text-sm font-medium">
                <span>Ende</span>
                <TimeSelect
                  name="end"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  endOfDay
                  required
                />
              </label>
            )}
          </div>
          {type === "consultation" && duration && (
            <p className="-mt-2 text-xs text-ink-soft">
              Dauer: {duration} Minuten (Einstellung der Person).
            </p>
          )}

          {type === "consultation" && (
            <>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Kontakt</p>
                <LeadPicker
                  key={`c-${tattooerId}`}
                  type="consultation"
                  tattooerId={null}
                  allowNew
                />
              </div>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Beratungsform</span>
                <Select name="mode" defaultValue="ON_SITE">
                  <option value="ON_SITE">Vor Ort</option>
                  <option value="PHONE">Telefon (kann nicht anreisen)</option>
                </Select>
              </label>
            </>
          )}

          {type === "tattoo" && (
            <>
              <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
                <input
                  type="checkbox"
                  name="walkIn"
                  value="1"
                  checked={walkIn}
                  onChange={(e) => setWalkIn(e.target.checked)}
                  className="mt-0.5 size-4 accent-current"
                />
                <span>
                  <span className="font-medium">Laufkunde (ohne Beratung)</span>
                  <span className="block text-xs text-ink-soft">
                    Tattoo direkt eintragen – wird auf der Lead-Seite als Laufkunde vermerkt.
                  </span>
                </span>
              </label>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Kontakt</p>
                {walkIn ? (
                  <LeadPicker key="walkin" type="consultation" tattooerId={null} allowNew />
                ) : (
                  <>
                    <LeadPicker
                      key={`t-${tattooerId}`}
                      type="tattoo"
                      tattooerId={tattooerId || null}
                      allowNew={false}
                    />
                    <p className="text-xs text-ink-soft">
                      Für Kontakte mit gebuchtem Tattoo (Ergebnis einer Beratung).
                    </p>
                  </>
                )}
              </div>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Betrag (optional)</span>
                <Input name="amount" inputMode="decimal" placeholder="z. B. 450" />
              </label>
            </>
          )}

          {type === "blocker" && (
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Notiz (optional)</span>
              <Textarea
                name="note"
                rows={2}
                maxLength={200}
                placeholder="z. B. Arzttermin, Pause …"
              />
              <span className="block text-xs font-normal text-ink-soft">
                In dieser Zeit werden keine Beratungen zugeteilt.
              </span>
            </label>
          )}

          {state && !state.ok && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
            >
              {state.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Speichert …" : "Eintragen"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
