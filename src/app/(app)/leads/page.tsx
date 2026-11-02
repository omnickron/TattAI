import type { Metadata } from "next";
import Link from "next/link";
import { LeadStatusBadge } from "@/components/lead-status-badge";
import { Badge, Button, ButtonLink, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime, formatPhone } from "@/lib/format";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, PLATFORM_LABELS } from "@/lib/labels";
import { listLeads, parseLeadFilters, type LeadFilters } from "@/lib/leads/queries";

export const metadata: Metadata = { title: "Leads" };

function pageHref(filters: LeadFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.campaign) params.set("campaign", filters.campaign);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/leads?${qs}` : "/leads";
}

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const user = await requireUser();
  const filters = parseLeadFilters(await searchParams);
  const { leads, total, pages, statusCounts, campaigns } = await listLeads(user, filters);
  const isAdmin = user.role === "ADMIN";
  const hasFilters = Boolean(filters.q || filters.status || filters.campaign);

  return (
    <>
      <PageHeader
        title="Leads"
        description={
          isAdmin
            ? `${total} ${total === 1 ? "Lead" : "Leads"}${hasFilters ? " (gefiltert)" : ""}`
            : "Leads mit Beratungsterminen bei dir"
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
        <Input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Name, Telefon oder E-Mail suchen"
          aria-label="Suche"
        />
        <Select name="status" defaultValue={filters.status ?? ""} aria-label="Status">
          <option value="">Alle Status</option>
          {LEAD_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]} ({statusCounts[s] ?? 0})
            </option>
          ))}
        </Select>
        <Select name="campaign" defaultValue={filters.campaign ?? ""} aria-label="Kampagne">
          <option value="">Alle Kampagnen</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.count})
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            Filtern
          </Button>
          {hasFilters && (
            <ButtonLink href="/leads" variant="ghost">
              Zurücksetzen
            </ButtonLink>
          )}
        </div>
      </form>

      {leads.length === 0 ? (
        <EmptyState>
          {hasFilters
            ? "Keine Leads für diese Filter gefunden."
            : isAdmin
              ? "Noch keine Leads eingegangen."
              : "Dir sind noch keine Leads zugeordnet. Sie erscheinen hier, sobald du Beratungstermine hast."}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_9rem_8.5rem] gap-4 border-b border-line bg-muted/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-soft md:grid">
            <span>Name</span>
            <span>Telefon</span>
            <span>Kampagne</span>
            <span>Status</span>
            <span className="text-right">Eingang</span>
          </div>
          <ul className="divide-y divide-line">
            {leads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/leads/${lead.id}`}
                  className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/50 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_9rem_8.5rem] md:items-center md:gap-4"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{lead.name}</span>
                    {lead.email && (
                      <span className="block truncate text-xs text-ink-soft">{lead.email}</span>
                    )}
                  </span>
                  <span className="justify-self-end md:hidden">
                    <LeadStatusBadge status={lead.status} />
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
                    {formatPhone(lead.phoneE164, lead.phoneRaw)}
                    {!lead.phoneValid && <Badge tone="red">ungültig</Badge>}
                    {!lead.whatsappConsent && lead.phoneValid && (
                      <Badge tone="amber">ohne Einwilligung</Badge>
                    )}
                  </span>
                  <span className="col-span-2 truncate text-sm text-ink-soft md:col-span-1">
                    {lead.source === "MANUAL"
                      ? "Manuell"
                      : [
                          lead.metaCampaignName,
                          lead.metaPlatform && PLATFORM_LABELS[lead.metaPlatform],
                        ]
                          .filter(Boolean)
                          .join(" · ") || "–"}
                  </span>
                  <span className="hidden md:block">
                    <LeadStatusBadge status={lead.status} />
                  </span>
                  <span className="col-span-2 text-xs text-ink-soft tabular-nums md:col-span-1 md:text-right md:text-sm">
                    {formatDateTime(lead.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Seiten">
          {filters.page > 1 ? (
            <ButtonLink href={pageHref(filters, filters.page - 1)} variant="secondary">
              ← Zurück
            </ButtonLink>
          ) : (
            <span />
          )}
          <span className="text-ink-soft">
            Seite {filters.page} von {pages}
          </span>
          {filters.page < pages ? (
            <ButtonLink href={pageHref(filters, filters.page + 1)} variant="secondary">
              Weiter →
            </ButtonLink>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
