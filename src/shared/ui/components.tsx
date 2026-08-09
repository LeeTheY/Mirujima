import type { ReactNode } from "react";
import type { DomainRule } from "../types/models";

export function MirujimaLogoIcon({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ borderRadius: "25%", display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      <rect width="512" height="512" rx="128" fill="#2F6FF2" />
      {/* Crisp Pure Geometric 'M' Monogram */}
      <path
        d="M 80 384 V 128 H 140 L 256 296 L 368 128 H 432 V 384 H 372 V 208 L 276 348 H 236 L 140 208 V 384 H 80 Z"
        fill="#FFFFFF"
      />
      {/* Flush Coral Ribbon Bookmark starting clean from top stroke of M stem */}
      <polygon points="372,128 412,128 412,248 392,230 372,248" fill="#FF6B4A" />
    </svg>
  );
}

export function BrandHeader({ subtitle = "오늘의 계획을 행동으로" }: { subtitle?: string }) {
  return (
    <header className="app-header">
      <MirujimaLogoIcon size={40} />
      <div className="brand-copy">
        <strong style={{ fontSize: "1.4rem", fontWeight: 850 }}>
          미루<span className="brand-accent">지마</span>
        </strong>
        <span>{subtitle}</span>
      </div>
    </header>
  );
}

export function DomainChips({ domains }: { domains: DomainRule[] }) {
  if (!domains.length) return <span className="muted small">등록된 사이트 없음</span>;
  return (
    <div className="domain-list">
      {domains.map((domain) => (
        <span className="domain-chip" key={domain.hostname}>
          {domain.hostname}
        </span>
      ))}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-block" aria-label={`${label} ${safe}%`}>
      <div className="row between small">
        <span>{label}</span>
        <strong>{safe}%</strong>
      </div>
      <div className="progress">
        <span style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
