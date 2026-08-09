import Link from "next/link";

interface BrandProps {
  showSubtitle?: boolean;
}

export function MirujimaLogoIcon({ size = 38 }: { size?: number }) {
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

export function Brand({ showSubtitle = false }: BrandProps) {
  return (
    <Link className="brand" href="/" aria-label="미루지마 홈" style={{ gap: "10px" }}>
      <MirujimaLogoIcon size={38} />
      <span className="brand-name" style={{ fontSize: "1.45rem", fontWeight: 850, letterSpacing: "-0.03em" }}>
        미루<span className="brand-accent">지마</span>
      </span>
      {showSubtitle && <span className="brand-subtitle text-xs text-muted font-normal ml-1.5">| 집중 지원 플랫폼</span>}
    </Link>
  );
}
