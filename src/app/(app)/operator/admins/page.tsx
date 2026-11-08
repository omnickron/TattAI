import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireOperator } from "@/lib/auth/session";
import { AdminsCard } from "../admins-card";

export const metadata: Metadata = { title: "Studio-Admins" };

/** Operator only: create and deactivate the studio's admins. */
export default async function OperatorAdminsPage() {
  const user = await requireOperator();
  return (
    <>
      <PageHeader title="Studio-Admins" description="Wer das Studio in NEEDL verwaltet." />
      <AdminsCard currentUserId={user.id} />
    </>
  );
}
