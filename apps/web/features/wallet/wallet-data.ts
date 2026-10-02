import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readWallet } from "./wallet-read";
import type { WalletSummary } from "./wallet-summary";
export type { WalletSummary } from "./wallet-summary";

export function loadWalletRead() {
  return readWallet(async () => (await createClient()).functions.invoke("wallet-summary", { body: {} }));
}

export async function loadWalletSummary(): Promise<WalletSummary | null> {
  const result = await loadWalletRead();
  return result.status === "ready" ? result.summary : null;
}
