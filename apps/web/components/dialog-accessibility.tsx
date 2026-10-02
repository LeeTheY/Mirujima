"use client";

import { useEffect } from "react";

// Legacy and route modals share one stack, so only the top dialog handles keys.
export function DialogAccessibility() {
  useEffect(() => {
    const states = new Map<HTMLElement, { previous: HTMLElement | null; inert: HTMLElement[] }>();
    const selector = ".modal-content, .notification-popover";
    const focusables = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter((item) => item.getClientRects().length && !item.closest("[inert]"));
    let priorOverflow = "";
    const sync = () => {
      // Next streams route content through hidden containers before moving it
      // into the visible tree. Registering those early loses initial focus.
      const dialogs = [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((dialog) => dialog.getClientRects().length > 0 && !dialog.closest("[hidden]"));
      for (const [dialog, state] of states) {
        if (dialogs.includes(dialog)) continue;
        for (const sibling of state.inert) sibling.inert = false;
        states.delete(dialog);
        if (state.previous?.isConnected) state.previous.focus();
      }
      for (const dialog of dialogs) {
        if (states.has(dialog)) continue;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const inert: HTMLElement[] = [];
        let ancestor: HTMLElement = dialog;
        while (ancestor.parentElement) {
          for (const sibling of ancestor.parentElement.children) {
            if (sibling === ancestor || !(sibling instanceof HTMLElement) || sibling.inert || ["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName)) continue;
            sibling.inert = true; inert.push(sibling);
          }
          ancestor = ancestor.parentElement;
          if (ancestor === document.body) break;
        }
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        if (!dialog.hasAttribute("aria-label") && !dialog.hasAttribute("aria-labelledby")) {
          dialog.setAttribute("aria-label", dialog.querySelector("h1,h2")?.textContent?.trim() || "안내");
        }
        dialog.tabIndex = -1;
        states.set(dialog, { previous, inert });
        (focusables(dialog)[0] ?? dialog).focus();
      }
      if (states.size && !document.body.dataset.dialogOpen) {
        priorOverflow = document.body.style.overflow;
        document.body.dataset.dialogOpen = "true";
        document.body.style.overflow = "hidden";
      } else if (!states.size && document.body.dataset.dialogOpen) {
        document.body.style.overflow = priorOverflow;
        delete document.body.dataset.dialogOpen;
      }
    };
    const keys = (event: KeyboardEvent) => {
      const dialog = [...states.keys()].at(-1);
      if (!dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        dialog.querySelector<HTMLButtonElement>(".icon-close-button")?.click();
      }
      if (event.key !== "Tab") return;
      const items = focusables(dialog), first = items[0], last = items.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); }
      else if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    sync(); window.addEventListener("keydown", keys);
    return () => {
      observer.disconnect(); window.removeEventListener("keydown", keys);
      for (const state of states.values()) for (const sibling of state.inert) sibling.inert = false;
      if (document.body.dataset.dialogOpen) { document.body.style.overflow = priorOverflow; delete document.body.dataset.dialogOpen; }
    };
  }, []);
  return null;
}
