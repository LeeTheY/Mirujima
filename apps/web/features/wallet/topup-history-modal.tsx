"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, History, CreditCard, ArrowDownRight, ArrowUpRight } from "lucide-react";

export interface TopupTransactionRecord {
  id: string;
  points: number;
  krwAmount: number;
  createdAt: string;
  provider: string;
  kind: "topup_confirmed" | "topup_refunded";
  status: string;
}

export function TopupHistoryModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<TopupTransactionRecord[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    async function fetchHistory() {
      setLoading(true);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const userId = user?.id;
        if (!userId) {
          if (mounted) {
            setRecords([]);
            setLoading(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from("wallet_transactions")
          .select("id, points, krw_amount, created_at, provider, kind, status")
          .or(`to_user_id.eq.${userId},from_user_id.eq.${userId}`)
          .in("kind", ["topup_confirmed", "topup_refunded"])
          .eq("status", "posted")
          .order("created_at", { ascending: false });

        if (error || !data) {
          if (mounted) setRecords([]);
        } else if (mounted) {
          setRecords(
            data.map((item) => ({
              id: item.id,
              points: Number(item.points) || 0,
              krwAmount: Number(item.krw_amount) || Number(item.points) || 0,
              createdAt: item.created_at,
              provider: item.provider || "toss",
              kind: item.kind as "topup_confirmed" | "topup_refunded",
              status: item.status,
            }))
          );
        }
      } catch {
        if (mounted) setRecords([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void fetchHistory();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay payment-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="modal-content payment-modal-content"
        role="dialog"
        aria-modal="true"
        aria-label="포인트 충전 및 환불 기록"
        style={{ width: "min(100%, 520px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="payment-modal-header">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <h1>포인트 충전 및 환불 내역</h1>
          </div>
          <button
            className="icon-close-button"
            type="button"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="payment-modal-body">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500">
              내역을 불러오는 중...
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center">
              <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-base font-extrabold text-navy mb-1">
                결제 및 환불 내역이 없습니다
              </p>
              <p className="text-xs text-gray-500">
                완료된 충전 및 환불 내역이 이곳에 표시됩니다.
              </p>
            </div>
          ) : (
            <div className="topup-history-scroll-list max-h-[380px] overflow-y-auto pr-1 space-y-3">
              {records.map((item) => {
                const isRefund = item.kind === "topup_refunded";
                const dateStr = new Date(item.createdAt).toLocaleString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
                      isRefund
                        ? "bg-rose-50/50 border-rose-100 hover:bg-rose-50"
                        : "bg-gray-50 border-gray-100 hover:bg-gray-100/80"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center ${
                          isRefund
                            ? "bg-rose-100 text-rose-600"
                            : "bg-emerald-100 text-emerald-600"
                        }`}
                      >
                        {isRefund ? (
                          <ArrowDownRight className="w-5 h-5" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <strong
                            className={`text-base font-extrabold ${
                              isRefund ? "text-rose-600" : "text-navy"
                            }`}
                          >
                            {isRefund ? "-" : "+"}{item.points.toLocaleString()} P
                          </strong>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              isRefund
                                ? "bg-rose-100 text-rose-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {isRefund ? "환불 완료" : "결제 완료"}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 block">
                          {dateStr} · {isRefund ? "결제 취소 환불" : item.provider === "toss" ? "토스 페이먼츠" : "테스트 결제"}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-xs font-bold block ${
                          isRefund ? "text-rose-600" : "text-gray-600"
                        }`}
                      >
                        {isRefund ? "-" : ""}{item.krwAmount.toLocaleString()}원
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
