import { parseWalletSummary, type WalletSummary } from "./wallet-summary";

export type WalletRead =
  | { status: "ready"; summary: WalletSummary; maxRefundableTopup: number | null; checkedAt: string }
  | { status: "unavailable"; reason: "request" | "format"; checkedAt: string };

export async function readWallet(invoke: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<WalletRead> {
  try {
    const { data, error } = await invoke();
    const checkedAt = new Date().toISOString();
    if (error) return { status: "unavailable", reason: "request", checkedAt };
    const summary = parseWalletSummary(data);
    if (!summary) return { status: "unavailable", reason: "format", checkedAt };
    const limit = Reflect.get(data as object, "maxRefundableTopup");
    return { status: "ready", summary, checkedAt, maxRefundableTopup: Number.isSafeInteger(limit) && limit >= 0 && limit <= summary.topupAvailable ? limit : null };
  } catch {
    return { status: "unavailable", reason: "request", checkedAt: new Date().toISOString() };
  }
}
