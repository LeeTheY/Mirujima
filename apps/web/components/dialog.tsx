"use client";

import { useId, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  return <div className="modal-overlay" onClick={onClose}>
    <section className="modal-content" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h2 id={titleId} className="text-xl font-extrabold text-navy m-0">{title}</h2>
        <button className="icon-close-button" type="button" onClick={onClose} aria-label={`${title} 닫기`}><X className="w-4 h-4" /></button>
      </header>
      {children}
    </section>
  </div>;
}
