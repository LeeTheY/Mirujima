export interface WalletSummary {
  topupAvailable: number;
  earnedAvailable: number;
  reservedAvailable: number;
  cashoutReserved: number;
  cashoutCompleted: number;
  guardianRewardCompleted: number;
}

export function parseWalletSummary(value: unknown): WalletSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys: (keyof WalletSummary)[] = ["topupAvailable", "earnedAvailable", "reservedAvailable", "cashoutReserved", "cashoutCompleted", "guardianRewardCompleted"];
  if (!keys.every((key) => Number.isSafeInteger(Reflect.get(value, key)) && Reflect.get(value, key) >= 0)) return null;
  return Object.fromEntries(keys.map((key) => [key, Reflect.get(value, key)])) as unknown as WalletSummary;
}

export function formatWalletPoints(value: number | undefined): string {
  return value === undefined ? "확인 불가" : `${value.toLocaleString("ko-KR")} P`;
}
