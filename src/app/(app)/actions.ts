"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { isOperator } from "@/lib/auth/operator";
import { requireUser, VIEW_COOKIE } from "@/lib/auth/session";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/** Operator only: look at the app with a tattooer's rights, or back to admin. */
export async function setViewMode(mode: "admin" | "tattooer") {
  const user = await requireUser();
  if (!isOperator(user) || !user.tattooerProfile) return;
  const jar = await cookies();
  if (mode === "tattooer")
    jar.set(VIEW_COOKIE, "tattooer", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  else jar.delete(VIEW_COOKIE);
  redirect("/");
}
