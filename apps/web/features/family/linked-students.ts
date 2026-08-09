export interface LinkedStudent {
  studentUserId: string;
  displayName: string;
  linkedAt: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseLinkedStudents(value: unknown): LinkedStudent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): LinkedStudent[] => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const studentUserId = typeof item.student_user_id === "string" ? item.student_user_id : "";
    const displayName = typeof item.display_name === "string" ? item.display_name.trim() : "";
    const linkedAt = typeof item.linked_at === "string" ? item.linked_at : "";
    if (!uuidPattern.test(studentUserId) || displayName.length < 1 || displayName.length > 100 || Number.isNaN(Date.parse(linkedAt))) return [];
    return [{ studentUserId, displayName, linkedAt }];
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ko") || left.studentUserId.localeCompare(right.studentUserId));
}

export function maskStudentId(studentUserId: string): string {
  return `${studentUserId.slice(0, 8)}…${studentUserId.slice(-4)}`;
}
