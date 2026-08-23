"use client";

import { useEffect } from "react";
import { shouldRegisterServiceWorker } from "@/lib/pwa";

export function PwaRegister() {
  useEffect(() => {
    const supported = "serviceWorker" in navigator;
    const secure = window.isSecureContext;
    const production = process.env.NODE_ENV === "production";
    if (shouldRegisterServiceWorker({ secure, supported, production })) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    }
  }, []);
  return null;
}
