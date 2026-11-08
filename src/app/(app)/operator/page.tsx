import { redirect } from "next/navigation";

/** The operator area is split into sub pages; the bot page is the start. */
export default function OperatorPage() {
  redirect("/operator/bot");
}
