"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginHref } from "./login-destination";

// OAuth providers can place errors in a fragment, which the callback server
// cannot read. Keep only a known error code and discard provider details.
export function OAuthErrorRecovery({ next }: { next: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const error = new URLSearchParams(window.location.hash.slice(1)).get("error");
    if (error) router.replace(loginHref(next, error === "access_denied" ? "cancelled" : "oauth"));
  }, [next, router]);
  return null;
}
