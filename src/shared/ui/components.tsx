import type { ReactNode } from "react";
import type { DomainRule } from "../types/models";

export function BrandHeader({ subtitle = "오늘의 계획을 행동으로" }: { subtitle?: string }) {
  return <header className="app-header">
    <img className="brand-icon" src="/icons/Mirujima_Icon.png" alt="미루지마" />
    <div className="brand-copy"><strong>미루지마</strong><span>{subtitle}</span></div>
  </header>;
}

export function DomainChips({ domains }: { domains: DomainRule[] }) {
  if (!domains.length) return <span className="muted small">등록된 사이트 없음</span>;
  return <div className="domain-list">{domains.map((domain) => <span className="domain-chip" key={domain.hostname}>{domain.hostname}</span>)}</div>;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div className="progress-block" aria-label={`${label} ${safe}%`}><div className="row between small"><span>{label}</span><strong>{safe}%</strong></div><div className="progress"><span style={{ width: `${safe}%` }} /></div></div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
