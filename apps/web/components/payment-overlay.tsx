"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function PaymentOverlay({
  title,
  returnHref,
  closeMode = "route",
  wide = false,
  children,
}: Readonly<{
  title: string;
  returnHref: string;
  closeMode?: "back" | "route";
  wide?: boolean;
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const close = useCallback(() => {
    if (closeMode === "back") {
      router.back();
      return;
    }
    router.push(returnHref);
  }, [closeMode, returnHref, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return (
    <div className="modal-overlay payment-modal-overlay" onClick={close}>
      <section
        aria-label={title}
        aria-modal="true"
        className={`modal-content payment-modal-content ${wide ? "payment-modal-wide" : ""}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="payment-modal-header">
          <h1>{title}</h1>
          <button className="icon-close-button" type="button" onClick={close} aria-label="결제 창 닫기">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="payment-modal-body">{children}</div>
      </section>
    </div>
  );
}
