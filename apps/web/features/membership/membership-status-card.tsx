import type { MembershipStatusView } from "./membership-status";

export function MembershipStatusSummary({ membership }: { membership: MembershipStatusView }) {
  const badgeClass = membership.tier === "premium"
    ? "membership"
    : membership.tier === "unavailable" ? "warning" : "inactive";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="card-label">멤버십 서비스</span>
        <span className={`badge-pill ${badgeClass}`}>{membership.badge}</span>
      </div>
      <h2>{membership.title}</h2>
      <p>{membership.description}</p>
      {membership.periodEndsOn ? (
        <div className="membership-period">
          <span>이용 종료일</span>
          <strong>{membership.periodEndsOn}</strong>
        </div>
      ) : null}
      {membership.productCode === "guardian_family" ? (
        <div className="membership-period">
          <span>학생 좌석</span>
          <strong>{membership.activeStudentCount} / {membership.seatCapacity}명</strong>
        </div>
      ) : null}
    </div>
  );
}
