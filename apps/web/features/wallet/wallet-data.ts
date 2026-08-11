import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface WalletSummary {
  topupAvailable: number;
  earnedAvailable: number;
  reservedAvailable: number;
  cashoutReserved: number;
  cashoutCompleted: number;
  guardianRewardCompleted: number;
}

export const EMPTY_WALLET_SUMMARY: WalletSummary = {
  topupAvailable: 0,
  earnedAvailable: 0,
  reservedAvailable: 0,
  cashoutReserved: 0,
  cashoutCompleted: 0,
  guardianRewardCompleted: 0,
};

function nonNegativeInteger(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

export async function loadWalletSummary(): Promise<WalletSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("wallet-summary", { body: {} });
  if (error || !data || typeof data !== "object") return EMPTY_WALLET_SUMMARY;
  return {
    topupAvailable: nonNegativeInteger(data.topupAvailable),
    earnedAvailable: nonNegativeInteger(data.earnedAvailable),
    reservedAvailable: nonNegativeInteger(data.reservedAvailable),
    cashoutReserved: nonNegativeInteger(data.cashoutReserved),
    cashoutCompleted: nonNegativeInteger(data.cashoutCompleted),
    guardianRewardCompleted: nonNegativeInteger(data.guardianRewardCompleted),
  };
}
