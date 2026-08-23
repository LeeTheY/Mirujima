"use client";

import { useEffect, useState } from "react";
import type { GuardianRewardRequest } from "@mirujima/contracts";
import { Check, X } from "lucide-react";
import { LinkedStudentsList } from "./linked-students-list";
import type { LinkedStudent } from "./linked-students";
import {
  approveGuardianRewardRequest,
  declineGuardianRewardRequest,
  listGuardianRewardRequests,
} from "./guardian-reward-data";

const statusCopy = {
  pending: "승인 대기",
  approved: "보상 예약",
  completed: "지급 완료",
  returned: "포인트 반환",
  declined: "거절",
  expired: "요청 만료",
} as const;

export function GuardianRewardRequests({ students, loadFailed }: { students: LinkedStudent[]; loadFailed: boolean }) {
  const [requests, setRequests] = useState<GuardianRewardRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setRequests(await listGuardianRewardRequests());
      setMessage(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "보상 요청을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const mutate = async (request: GuardianRewardRequest, action: "approve" | "decline") => {
    if (busyId) return;
    setBusyId(request.id);
    setMessage(null);
    try {
      if (action === "approve") await approveGuardianRewardRequest(request.id);
      else await declineGuardianRewardRequest(request.id);
      setMessage(action === "approve"
        ? `${request.studentDisplayName} 학생의 ${request.points.toLocaleString()}P 보상을 예약했습니다.`
        : `${request.studentDisplayName} 학생의 보상 요청을 거절했습니다.`);
      await reload();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "보상 요청을 처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <article className="card linked-list">
        <span className="card-label">연결된 학생 목록</span>
        <LinkedStudentsList students={students} loadFailed={loadFailed} />
      </article>
      <article className="card">
        <span className="card-label">보상 요청 관리</span>
        <h2>학생 보상 요청</h2>
        <p>승인하면 보호자 충전 포인트가 예약되고, 학생이 집중을 성공했을 때만 획득 포인트로 지급됩니다.</p>
        {message && <div className="notice" role="status"><p>{message}</p></div>}
        {loading && requests.length === 0 ? (
          <div className="sub-card text-center text-muted text-sm">보상 요청을 불러오는 중입니다.</div>
        ) : requests.length === 0 ? (
          <div className="sub-card text-center text-muted text-sm">대기 중인 보상 요청이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <div className="sub-card" key={request.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-navy block">{request.studentDisplayName}</strong>
                    <span className="text-xs text-muted">{new Date(request.createdAt).toLocaleString("ko-KR")}</span>
                  </div>
                  <span className="badge">{statusCopy[request.status]}</span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-3">
                  <strong className="text-blue-600 text-lg">{request.points.toLocaleString()} P</strong>
                  {request.status === "pending" && (
                    <div className="flex gap-2">
                      <button className="button secondary small" type="button" disabled={Boolean(busyId)} onClick={() => void mutate(request, "decline")}><X className="w-3.5 h-3.5" /> 거절</button>
                      <button className="button small" type="button" disabled={Boolean(busyId)} onClick={() => void mutate(request, "approve")}><Check className="w-3.5 h-3.5" /> {busyId === request.id ? "처리 중" : "승인"}</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
