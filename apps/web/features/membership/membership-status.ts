export type MembershipTier = "free" | "premium" | "unavailable";

export interface MembershipStatusView {
  tier: MembershipTier;
  badge: string;
  title: string;
  description: string;
  actionLabel: string;
  periodEndsOn: string | null;
  productCode: "student_premium" | "guardian_family" | null;
  source: "direct" | "guardian_family" | null;
  activeStudentCount: number;
  seatCapacity: number;
}

export interface MembershipRecord {
  plan?: unknown;
  status?: unknown;
  current_period_ends_at?: unknown;
  currentPeriodEndsAt?: unknown;
  productCode?: unknown;
  membershipSource?: unknown;
  source?: unknown;
  activeStudentCount?: unknown;
  seatCapacity?: unknown;
}

const FREE_MEMBERSHIP: MembershipStatusView = {
  tier: "free",
  badge: "무료 플랜",
  title: "미루지마 기본 서비스 이용 중",
  description: "Premium 멤버십에 가입하지 않은 상태입니다. 기본 기능은 계속 이용할 수 있습니다.",
  actionLabel: "Premium 혜택 알아보기",
  periodEndsOn: null,
  productCode: null,
  source: null,
  activeStudentCount: 0,
  seatCapacity: 0,
};

export const UNAVAILABLE_MEMBERSHIP: MembershipStatusView = {
  tier: "unavailable",
  badge: "상태 확인 필요",
  title: "멤버십 상태를 확인하지 못했습니다",
  description: "기존 데이터는 안전합니다. 잠시 후 멤버십 정보를 다시 확인해 주세요.",
  actionLabel: "멤버십 확인",
  periodEndsOn: null,
  productCode: null,
  source: null,
  activeStudentCount: 0,
  seatCapacity: 0,
};

function formatPeriodEnd(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function resolveMembershipStatus(
  record: MembershipRecord | null,
  now = new Date(),
): MembershipStatusView {
  const periodEndsAt = typeof record?.currentPeriodEndsAt === "string"
    ? record.currentPeriodEndsAt
    : typeof record?.current_period_ends_at === "string" ? record.current_period_ends_at
    : null;
  const periodEndsMs = periodEndsAt ? Date.parse(periodEndsAt) : Number.NaN;
  const periodActive = !periodEndsAt || (Number.isFinite(periodEndsMs) && periodEndsMs > now.getTime());
  const premiumActive = record?.plan === "premium" && record.status === "active" && periodActive;

  if (!premiumActive) return FREE_MEMBERSHIP;
  const productCode = record.productCode === "student_premium" || record.productCode === "guardian_family"
    ? record.productCode : null;
  const sourceValue = record.membershipSource ?? record.source;
  const source = sourceValue === "direct" || sourceValue === "guardian_family" ? sourceValue : null;
  const activeStudentCount = Number.isSafeInteger(record.activeStudentCount) ? Number(record.activeStudentCount) : 0;
  const seatCapacity = Number.isSafeInteger(record.seatCapacity) ? Number(record.seatCapacity) : 0;
  const guardianFamily = productCode === "guardian_family";
  const inherited = source === "guardian_family";
  return {
    tier: "premium",
    badge: inherited ? "가족 Premium 소속" : guardianFamily ? "가족 Premium 이용 중" : "학생 Premium 이용 중",
    title: inherited ? "보호자 가족 멤버십 적용 중" : guardianFamily ? "가족 Premium 활성화" : "학생 Premium 활성화",
    description: inherited ? "연결 보호자의 가족 멤버십으로 학생 AI 기능을 이용할 수 있습니다."
      : guardianFamily ? "연결 학생의 AI 기능과 보호자 가족 요약을 이용할 수 있습니다."
      : "집중 계획 AI 첨삭과 학생 Premium 기능을 이용할 수 있습니다.",
    actionLabel: "멤버십 관리",
    periodEndsOn: periodEndsAt ? formatPeriodEnd(periodEndsAt) : null,
    productCode,
    source,
    activeStudentCount,
    seatCapacity,
  };
}
