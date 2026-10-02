import { z } from "zod";
import { parseWalletHistory, walletRowBefore, walletCursorSchema, WALLET_CATEGORIES, type WalletCategory, type WalletCursor, type WalletHistoryPage } from "./wallet-history";
interface RpcClient { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }
export async function loadWalletHistory(client: RpcClient, ownerId: string, category: WalletCategory, cursor: WalletCursor | null = null, transactionId: string | null = null): Promise<WalletHistoryPage> {
  if (!z.uuid().safeParse(ownerId).success || !WALLET_CATEGORIES.includes(category) || (cursor && !walletCursorSchema.safeParse(cursor).success) || (transactionId && (!z.uuid().safeParse(transactionId).success || cursor))) throw new Error("거래 조회 조건을 확인해 주세요.");
  try {
    const { data, error } = await client.rpc("list_wallet_transactions", {
      p_category: category, p_limit: 20, p_before_at: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null, p_transaction_id: transactionId,
    });
    const page = error ? null : parseWalletHistory(data, ownerId);
    if (!page || (transactionId && page.items.some((item) => item.id !== transactionId.toLowerCase())) || (cursor && page.items.some((item) => !walletRowBefore(item, cursor)))) throw new Error("invalid_response");
    return page;
  } catch {
    throw new Error("거래 내역을 확인하지 못했습니다. 로그인과 인터넷 연결을 확인한 뒤 다시 조회해 주세요.");
  }
}
