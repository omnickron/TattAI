import Link from "next/link";
import { cn } from "@/components/ui";

/** Tabs of the WhatsApp admin: sending settings and message texts. */
export function WhatsAppTabs({ active }: { active: "sending" | "texts" }) {
  const tabs = [
    { key: "sending", href: "/admin/whatsapp", label: "Versand" },
    { key: "texts", href: "/admin/whatsapp/templates", label: "Texte (Templates)" },
  ] as const;
  return (
    <nav className="mb-5 flex gap-1 border-b border-line" aria-label="WhatsApp">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            active === t.key
              ? "border-ink text-ink"
              : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
