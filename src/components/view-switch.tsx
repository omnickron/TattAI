import { setViewMode } from "@/app/(app)/actions";
import { cn } from "./ui";

/** Operator only: switch between admin rights and a tattooer's rights (own profile). */
export function ViewSwitch({ current }: { current: "admin" | "tattooer" }) {
  const option = (mode: "admin" | "tattooer", label: string) => (
    <form action={setViewMode.bind(null, mode)}>
      <button
        type="submit"
        aria-pressed={current === mode}
        disabled={current === mode}
        title={
          mode === "tattooer"
            ? "Die App mit den Rechten eines Tätowierers ansehen (dein eigenes Profil)"
            : "Zurück zur Admin-Ansicht"
        }
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors",
          current === mode ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
        )}
      >
        {label}
      </button>
    </form>
  );
  return (
    <span
      role="group"
      aria-label="Ansicht"
      className="inline-flex items-center rounded-full border border-line p-0.5"
    >
      {option("admin", "Admin")}
      {option("tattooer", "Tätowierer")}
    </span>
  );
}
