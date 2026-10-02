"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog } from "@/components/dialog";
import { parseTopupHistory, topupHistoryLabel, TOPUP_HISTORY_COLUMNS, TOPUP_HISTORY_KINDS, type TopupHistoryRecord } from "./topup-history";

export function TopupHistoryModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<TopupHistoryRecord[]>([]);
  const [error, setError] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    async function fetchHistory() {
      setLoading(true);
      setError(false);
      setRecords([]);
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("authentication_required");
        const { data, error: queryError } = await supabase.from("wallet_transactions")
          .select(TOPUP_HISTORY_COLUMNS)
          .or(`to_user_id.eq.${user.id},from_user_id.eq.${user.id}`)
          .in("kind", [...TOPUP_HISTORY_KINDS])
          .order("created_at", { ascending: false }).limit(100);
        const parsed = queryError ? null : parseTopupHistory(data, user.id);
        if (!parsed) throw new Error("history_unavailable");
        if (mounted) setRecords(parsed);
      } catch {
        if (mounted) setError(true);
      } finally {
        if (mounted) { setCheckedAt(new Date().toISOString()); setLoading(false); }
      }
    }
    void fetchHistory();
    return () => { mounted = false; };
  }, [isOpen, revision]);

  if (!isOpen) return null;
  return <Dialog title="포인트 충전 및 환불 내역" onClose={onClose}>
    <div className="topup-history-content">
      <Link className="button secondary small" href="/wallet/history" onClick={onClose}>집중·보상·지급 포함 전체 거래</Link>
      <p className="text-sm text-muted">최근 원장 100건 기준입니다. 처리 중인 주문은 충전 완료로 계산하지 않습니다.</p>
      {checkedAt && <p className="text-xs text-muted">조회 시점: <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleString("ko-KR")}</time></p>}
      <button className="button secondary small" type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>내역 다시 확인</button>
      {loading ? <p role="status">내역을 불러오는 중…</p> : error ? <div className="notice error" role="alert"><strong>거래 내역을 확인하지 못했습니다.</strong><p>인터넷 연결과 로그인 상태를 확인한 후 다시 조회해 주세요. 현재 잔액이나 결제 결과를 확정할 수 없습니다.</p></div> : records.length === 0 ? <p>충전 및 환불 내역이 없습니다.</p> :
        <ul className="topup-history-scroll-list">
          {records.map((item) => <li key={item.id} className="sub-card">
            <strong>{item.points.toLocaleString("ko-KR")} P · {topupHistoryLabel(item)}</strong>
            <p>{new Date(item.created_at).toLocaleString("ko-KR")} · {item.kind.includes("refund") ? "원 결제 환불" : "포인트 충전"}</p>
            <p>{item.provider === "sandbox" ? "내부 기록 · 결제사 승인 없음" : item.provider === "toss" ? "Toss Payments" : "결제 제공자 확인 필요"}</p>
            {(item.provider_order_id || item.related_transaction_id) && <details className="transaction-reference"><summary>거래 식별 정보</summary>
              {item.provider_order_id && <p>주문: {item.provider_order_id}</p>}
              {item.related_transaction_id && <p>연결 거래: {item.related_transaction_id}</p>}
            </details>}
            {item.status === "failed" && <p>이 거래는 완료되지 않았습니다. 결제 결과와 잔액을 다시 확인해 주세요.</p>}
          </li>)}
        </ul>}
    </div>
  </Dialog>;
}
