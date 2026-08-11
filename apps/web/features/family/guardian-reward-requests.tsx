import { LinkedStudentsList } from "./linked-students-list";
import type { LinkedStudent } from "./linked-students";

export function GuardianRewardRequests({ students, loadFailed }: { students: LinkedStudent[]; loadFailed: boolean }) {
  return (
    <div className="space-y-4">
      <article className="card linked-list">
        <span className="card-label">연결된 학생 목록</span>
        <LinkedStudentsList students={students} loadFailed={loadFailed} />
      </article>
      <article className="card">
        <span className="card-label">보상 요청 관리</span>
        <h2>대기 중인 보상 요청이 없습니다.</h2>
        <p>연결 학생이 보상을 요청하면 학생 이름과 함께 이곳에 표시됩니다.</p>
      </article>
    </div>
  );
}
