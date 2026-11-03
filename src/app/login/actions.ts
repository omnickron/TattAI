"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { isDevLoginEnabled } from "@/lib/auth/dev-login";

function safeCallback(value: FormDataEntryValue | null): string {
  const url = typeof value === "string" ? value : "";
  return url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

export async function signInAsDevUser(formData: FormData) {
  if (!isDevLoginEnabled()) redirect("/login");
  try {
    await signIn("dev", {
      email: String(formData.get("email") ?? ""),
      redirectTo: safeCallback(formData.get("callbackUrl")),
    });
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?error=AccessDenied");
    throw err;
  }
}
