"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function WalletUnavailable({ checkedAt }: { checkedAt?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="notice error" role="status">
    <strong>잔액을 확인하지 못했습니다.</strong>
    <p>현재 잔액을 확인할 수 없습니다. 처리 중인 요청이 있다면 거래 내역을 확인해 주세요.</p>
    {checkedAt && <p>조회 시점: <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time></p>}
    <button type="button" className="button secondary small" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "확인 중…" : "잔액 다시 확인"}</button>
  </div>;
}
