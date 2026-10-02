"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loadWalletHistory } from "./wallet-history-data";
import { WALLET_CATEGORIES, WALLET_CATEGORY_LABELS, walletHistoryTitle, walletHistoryStatus, walletHistoryMovement, walletHistoryReason, type WalletCategory, type WalletHistoryPage } from "./wallet-history";

interface WalletHistoryProps { ownerId: string; role: "student" | "guardian"; transactionId: string | null }
export function WalletHistoryPanel(props: WalletHistoryProps) {
  const [category, setCategory] = useState<WalletCategory>("all");
  const [revision, setRevision] = useState(0);
  const effectiveCategory = props.transactionId ? "all" : category;
  return <WalletHistoryTransactions key={`${props.ownerId}:${props.transactionId}:${effectiveCategory}:${revision}`} {...props} category={effectiveCategory} onCategoryChange={setCategory} onRefresh={() => setRevision((value) => value + 1)} />;
}

function WalletHistoryTransactions({ ownerId, role, transactionId, category, onCategoryChange, onRefresh }: WalletHistoryProps & { category: WalletCategory; onCategoryChange: (value: WalletCategory) => void; onRefresh: () => void }) {
  const [page, setPage] = useState<WalletHistoryPage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attemptAt, setAttemptAt] = useState<string | null>(null);
  const generation = useRef(0);
  const appending = useRef(false);

  useEffect(() => {
    const request = ++generation.current;
    appending.current = false;
    void (async () => loadWalletHistory(createClient(), ownerId, category, null, transactionId))().then((result) => {
      if (generation.current === request) setPage(result);
    }).catch((cause: unknown) => {
      if (generation.current === request) setError(cause instanceof Error ? cause.message : "거래 내역을 확인하지 못했습니다.");
    }).finally(() => {
      if (generation.current === request) { setBusy(false); setAttemptAt(new Date().toISOString()); }
    });
    return () => { generation.current = request + 1; };
  }, [ownerId, category, transactionId]);

  async function more() {
    if (busy || appending.current || !page?.nextCursor) return;
    const request = generation.current;
    appending.current = true; setBusy(true); setError(null);
    try {
      const next = await loadWalletHistory(createClient(), ownerId, category, page.nextCursor, transactionId);
      if (generation.current !== request) return;
      if (next.items.some((item) => page.items.some((previous) => previous.id === item.id))) throw new Error("중복 거래가 반환되었습니다. 목록을 다시 조회해 주세요.");
      setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (cause) {
      if (generation.current === request) setError(cause instanceof Error ? cause.message : "거래 내역을 확인하지 못했습니다.");
    } finally {
      if (generation.current === request) { appending.current = false; setBusy(false); setAttemptAt(new Date().toISOString()); }
    }
  }

  return <section className="wallet-history-panel" aria-label="전체 포인트 거래 내역" aria-busy={busy}>
    <details className="wallet-history-guide"><summary>거래 상태 안내</summary><p>예약·반환·지급은 각각 별도 거래입니다. 목록의 포인트 합계는 가용 잔액이 아닙니다. 원장 반영과 실제 결제·송금은 구분되며, 실제 현금화 송금은 비활성화되어 있습니다.</p></details>
    <div className="wallet-history-toolbar">
      {transactionId ? <Link className="button secondary small" href="/wallet/history">전체 거래로 돌아가기</Link> : <div className="wallet-history-filters" role="group" aria-label="거래 종류">
        {WALLET_CATEGORIES.map((value) => <button className="button secondary small" type="button" key={value} aria-pressed={category === value} onClick={() => onCategoryChange(value)}>{WALLET_CATEGORY_LABELS[value]}</button>)}
      </div>}
      <button className="button secondary small" type="button" disabled={busy} onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" />새로고침</button>
    </div>
    <div className="wallet-history-checked">
      {page && <span>조회 기준 <time dateTime={page.checkedAt}>{new Date(page.checkedAt).toLocaleString("ko-KR")}</time></span>}
      {error && attemptAt && <span>최근 조회 시도 <time dateTime={attemptAt}>{new Date(attemptAt).toLocaleString("ko-KR")}</time></span>}
    </div>
    {error && <div className="notice error" role="alert"><strong>{error}</strong>{page && <p>기존 목록은 마지막 성공 조회 기준입니다. 다음 페이지를 다시 조회할 수 있습니다.</p>}</div>}
    {busy && <p role="status">거래 내역을 불러오는 중…</p>}
    {!busy && !error && page?.items.length === 0 && <p>{transactionId ? "조회 가능한 본인 거래를 찾지 못했습니다." : "이 종류의 거래 내역이 없습니다."}</p>}
    {page && <ol className="wallet-history-list">{page.items.map((item) => <li className="wallet-history-item" key={item.id}>
      <div className="wallet-history-item-heading"><h2>{walletHistoryTitle(item)}</h2><strong>{item.points.toLocaleString("ko-KR")} P</strong></div>
      <p className="wallet-history-status">{walletHistoryStatus(item)}</p>
      {walletHistoryReason(item) && <p className="notice">{walletHistoryReason(item)}</p>}
      <div className="wallet-history-meta"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ko-KR")}</time>{item.provider && <span>{item.provider === "sandbox" ? "내부 기록 · 결제·송금 확인 없음" : "Toss Payments"}</span>}</div>
      <div className="wallet-history-item-actions">
      <details className="wallet-transaction-details" open={transactionId ? true : undefined}>
        <summary>거래 정보</summary>
        <p>{walletHistoryMovement(item)}</p>
        <dl><dt>거래 ID</dt><dd>{item.id}</dd>
          {item.orderId && <><dt>주문 ID</dt><dd>{item.orderId}</dd></>}
          {item.scheduleId && <><dt>계획 ID</dt><dd>{item.scheduleId}</dd></>}
          {item.sessionId && <><dt>세션 ID</dt><dd>{item.sessionId}</dd></>}
        </dl>
      </details>
      <div className="wallet-history-links">
        {!transactionId && <Link href={`/wallet/history?transaction=${item.id}`}>이 거래만 확인</Link>}
        {item.relatedTransactionId && <Link href={`/wallet/history?transaction=${item.relatedTransactionId}`}>이전 연결 거래 확인</Link>}
        {item.resolutionTransactionId && <Link href={`/wallet/history?transaction=${item.resolutionTransactionId}`}>결과 연결 거래 확인</Link>}
        {(item.scheduleId || item.sessionId) && <Link href={role === "guardian" ? "/guardian/rewards" : "/history"}>{role === "guardian" ? "보상 요청 관리" : "집중 기록 보기"}</Link>}
      </div>
      </div>
    </li>)}</ol>}
    {page?.hasMore && <button className="button secondary" type="button" disabled={busy} onClick={() => void more()}>다음 거래 조회</button>}
  </section>;
}
