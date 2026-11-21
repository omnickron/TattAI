import Link from "next/link";
import { cn } from "@/components/ui";

/** Tabs of the WhatsApp admin: sending settings and message texts. */
export function WhatsAppTabs({ active }: { active: "sending" | "texts" | "voice" }) {
  const tabs = [
    { key: "sending", href: "/admin/whatsapp", label: "Versand" },
    { key: "texts", href: "/admin/whatsapp/templates", label: "Texte (Templates)" },
    { key: "voice", href: "/admin/whatsapp/voice", label: "Sprachnachrichten" },
  ] as const;
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="WhatsApp">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
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
