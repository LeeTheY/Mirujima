import { maskStudentId, type LinkedStudent } from "./linked-students";

export function LinkedStudentsList({ students, loadFailed }: { students: LinkedStudent[]; loadFailed: boolean }) {
  if (loadFailed) return <div className="notice error"><strong>학생 목록을 불러오지 못했습니다.</strong><p>잠시 후 다시 확인해 주세요.</p></div>;
  if (students.length === 0) return <div className="sub-card text-center text-muted text-sm">연결된 학생이 없습니다.</div>;
  return <div className="space-y-2">{students.map((student) => <div className="sub-card flex items-center justify-between" key={student.studentUserId}><div><strong className="text-navy text-sm block">{student.displayName}</strong><span className="text-xs text-muted">{maskStudentId(student.studentUserId)}</span></div><span className="text-xs text-muted">{new Date(student.linkedAt).toLocaleDateString("ko-KR")}</span></div>)}</div>;
}
