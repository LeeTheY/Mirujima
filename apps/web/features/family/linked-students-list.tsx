"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/dialog";
import { disconnectFamilyLink } from "./privacy-mutations";
import { Unlink, Check } from "lucide-react";
import type { LinkedStudent } from "./linked-students";

export function LinkedStudentsList({
  students,
  loadFailed,
  allowDisconnect = false,
}: {
  students: LinkedStudent[];
  loadFailed: boolean;
  allowDisconnect?: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [studentsToDisconnect, setStudentsToDisconnect] = useState<LinkedStudent[] | null>(null);

  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState("");
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const visibleStudents = students.filter((student) => !removedIds.includes(student.studentUserId));
  async function disconnectSelected() {
    if (!studentsToDisconnect || disconnecting) return;
    setDisconnecting(true);
    setDisconnectError("");
    const succeeded: string[] = [];
    const failures: LinkedStudent[] = [];
    const messages: string[] = [];
    for (const student of studentsToDisconnect) {
      try { await disconnectFamilyLink(student.studentUserId); succeeded.push(student.studentUserId); }
      catch (error) { failures.push(student); messages.push(`${student.displayName}: ${error instanceof Error ? error.message : "연결을 해제하지 못했습니다."}`); }
    }
    setRemovedIds((previous) => [...previous, ...succeeded]);
    setSelectedIds(failures.map((student) => student.studentUserId));
    setStudentsToDisconnect(failures.length ? failures : null);
    setDisconnectError(messages.join(" "));
    setDisconnecting(false);
    if (succeeded.length) router.refresh();
  }

  if (loadFailed) {
    return (
      <div className="notice error">
        <strong>학생 목록을 불러오지 못했습니다.</strong>
        <p>잠시 후 다시 확인해 주세요.</p>
      </div>
    );
  }

  if (visibleStudents.length === 0) {
    return <div className="sub-card text-center text-muted text-sm">연결된 학생이 없습니다.</div>;
  }

  return (
    <>
      <div className="space-y-2">
        {visibleStudents.map((student) => {
          const isChecked = selectedIds.includes(student.studentUserId);
          return (
            <label
              key={student.studentUserId}
              className="sub-card py-2 px-3 flex items-center justify-between cursor-pointer transition-all"
              style={
                isChecked
                  ? {
                      borderColor: "#2F6FF2",
                      borderWidth: "2px",
                      borderStyle: "solid",
                      backgroundColor: "#EAF2FF",
                    }
                  : undefined
              }
            >
              <div className="flex items-center gap-3">
                {allowDisconnect && (
                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                      isChecked
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm scale-105"
                        : "bg-white border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds([...selectedIds, student.studentUserId]);
                        } else {
                          setSelectedIds(selectedIds.filter((id) => id !== student.studentUserId));
                        }
                      }}
                    />
                  </div>
                )}
                <div>
                  <strong className="text-navy text-sm block">{student.displayName}</strong>
                </div>
              </div>
              <span className="text-xs text-muted">
                {new Date(student.linkedAt).toLocaleDateString("ko-KR")}
              </span>
            </label>
          );
        })}
      </div>

      {allowDisconnect && (
        <div className="mt-2">
          <button
            className="disconnect-link-button"
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => {
              const selected = visibleStudents.filter((s) => selectedIds.includes(s.studentUserId));
              if (selected.length > 0) {
                setDisconnectError("");
                setStudentsToDisconnect(selected);
              }
            }}
          >
            <Unlink className="w-4 h-4" aria-hidden="true" />
            <span>
              {selectedIds.length === 0
                ? "연결 해제할 학생을 선택하세요"
                : selectedIds.length === 1
                ? `${students.find((s) => s.studentUserId === selectedIds[0])?.displayName || ""} 학생 연결 해제`
                : `선택한 ${selectedIds.length}명의 학생 연결 해제`}
            </span>
          </button>
        </div>
      )}

      {studentsToDisconnect && studentsToDisconnect.length > 0 && (
        <Dialog title="학생 연결 해제" onClose={() => { if (!disconnecting) setStudentsToDisconnect(null); }}>
          <p className="text-sm text-gray-600 m-0">{studentsToDisconnect.map((student) => student.displayName).join(", ")} 학생과의 연결을 해제합니다. 미정산 보상·예약 포인트가 있는 학생은 연결을 유지합니다.</p>
          {disconnectError && <p className="notice error" role="alert">{disconnectError}</p>}
          <div className="flex gap-2 mt-4">
            <button className="button secondary full" type="button" disabled={disconnecting} onClick={() => setStudentsToDisconnect(null)}>취소</button>
            <button className="button full" style={{ background: "#FF5A5F", borderColor: "#FF5A5F" }} type="button" disabled={disconnecting} onClick={() => void disconnectSelected()}>{disconnecting ? "해제 확인 중…" : "연결 해제"}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
