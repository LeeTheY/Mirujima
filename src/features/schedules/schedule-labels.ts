import type { ScheduleStatus } from "../../shared/types/models";

const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  scheduled: "예정",
  snoozed: "미룸",
  focusing: "집중 중",
  paused: "일시정지",
  completed: "완료",
  cancelled: "취소",
  incomplete: "미완료",
};

export function getScheduleStatusLabel(status: ScheduleStatus): string {
  return SCHEDULE_STATUS_LABELS[status];
}
