export interface GuardianMyCard {
  label: string;
  title: string;
  description: string;
  gridSpan: 1;
  showHeading?: boolean;
  href?: string;
  action?: string;
}

export const GUARDIAN_MY_CARDS: GuardianMyCard[] = [
  { label: "로그인 계정 정보", title: "Google 로그인 연결됨", description: "보호자 권한으로 로그인되어 있습니다.", gridSpan: 1 },
  { label: "보호자 지갑", title: "포인트 충전 및 관리", description: "학생 보상에 사용할 포인트를 테스트 결제로 충전합니다.", gridSpan: 1, href: "/wallet/charge", action: "포인트 충전" },
  { label: "멤버십", title: "Mirujima Premium", description: "가족 요약과 프리미엄 기능을 확인합니다.", gridSpan: 1, href: "/membership/checkout", action: "멤버십 확인" },
  { label: "연결 학생", title: "학생 연결 관리", description: "5분 동안 유효한 코드를 발급하고 연결 상태를 확인합니다.", gridSpan: 1, showHeading: false },
  { label: "가족 활동 요약", title: "공유된 집중 기록", description: "학생이 동의한 달성 여부와 총 집중 시간만 표시됩니다.", gridSpan: 1, href: "/guardian/history", action: "기록 보기" },
  { label: "보상 요청 관리", title: "학생 보상 요청", description: "연결 학생의 보상 요청을 확인하고 포인트를 예약합니다.", gridSpan: 1, href: "/guardian/students", action: "요청 확인" },
];
