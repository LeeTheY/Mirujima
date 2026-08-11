"use client";

import { useState } from "react";
import { Unlink, X, Check } from "lucide-react";
import { maskStudentId, type LinkedStudent } from "./linked-students";

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

  if (loadFailed) {
    return (
      <div className="notice error">
        <strong>학생 목록을 불러오지 못했습니다.</strong>
        <p>잠시 후 다시 확인해 주세요.</p>
      </div>
    );
  }

  if (students.length === 0) {
    return <div className="sub-card text-center text-muted text-sm">연결된 학생이 없습니다.</div>;
  }

  return (
    <>
      <div className="space-y-2">
        {students.map((student) => {
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
              const selected = students.filter((s) => selectedIds.includes(s.studentUserId));
              if (selected.length > 0) {
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
        <div className="modal-overlay" onClick={() => setStudentsToDisconnect(null)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-xl font-extrabold text-rose-600 m-0">학생 연결 해제</h2>
              <button
                className="icon-close-button"
                type="button"
                onClick={() => setStudentsToDisconnect(null)}
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600 m-0">
              {studentsToDisconnect.length === 1
                ? `${studentsToDisconnect[0].displayName} 학생과의 연결을 해제하면 학습 공유 및 가족 보상 요청이 즉시 중단됩니다. 해제하시겠습니까?`
                : `선택한 ${studentsToDisconnect.length}명의 학생과의 연결을 해제하면 학습 공유 및 가족 보상 요청이 즉시 중단됩니다. 해제하시겠습니까?`}
            </p>
            <div className="flex gap-2 mt-4">
              <button
                className="button secondary full"
                type="button"
                onClick={() => setStudentsToDisconnect(null)}
              >
                취소
              </button>
              <button
                className="button full"
                style={{ background: "#FF5A5F", borderColor: "#FF5A5F" }}
                type="button"
                onClick={() => {
                  setSelectedIds([]);
                  setStudentsToDisconnect(null);
                }}
              >
                연결 해제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
