"use client";

import { useEffect } from "react";
import { shouldRegisterServiceWorker } from "@/lib/pwa";

export function PwaRegister() {
  useEffect(() => {
    const supported = "serviceWorker" in navigator;
    const secure = window.isSecureContext;
    if (shouldRegisterServiceWorker({ secure, supported })) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
