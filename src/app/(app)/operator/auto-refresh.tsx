"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Reloads the server data every few seconds (while a bot test is running). */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
