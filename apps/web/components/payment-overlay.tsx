"use client";

import { useCallback, useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLElement>(null);
  const close = useCallback(() => {
    if (closeMode === "back") {
      router.back();
      return;
    }
    router.push(returnHref);
  }, [closeMode, returnHref, router]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusables = () => dialog ? [...dialog.querySelectorAll<HTMLElement>(focusableSelector)] : [];
    (focusables()[0] ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab" && dialog) {
        const items = focusables();
        if (items.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = items[0];
        const last = items.at(-1) ?? first;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [close]);

  return (
    <div className="modal-overlay payment-modal-overlay" onClick={close}>
      <section
        ref={dialogRef}
        aria-label={title}
        aria-modal="true"
        className={`modal-content payment-modal-content ${wide ? "payment-modal-wide" : ""}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        tabIndex={-1}
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
