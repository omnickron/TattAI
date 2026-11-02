import type { LeadStatus } from "@/generated/prisma/enums";
import { LEAD_STATUS_LABELS, LEAD_STATUS_TONE } from "@/lib/labels";
import { Badge } from "./ui";

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={LEAD_STATUS_TONE[status]}>{LEAD_STATUS_LABELS[status]}</Badge>;
}
