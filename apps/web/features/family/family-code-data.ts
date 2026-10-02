import { z } from "zod";
import { familyLinkErrorCopy, safeFunctionErrorCode } from "./family-link";

const timestamp = z.string().datetime({ offset: true });
const issuedSchema = z.object({
  id: z.string().uuid(), status: z.literal("pending"), code: z.string().regex(/^\d{6}$/),
  codeExpiresAt: timestamp.optional(), expiresAt: timestamp.optional(), serverNow: timestamp.optional(),
}).refine((value) => Boolean(value.codeExpiresAt || value.expiresAt));
const activeSchema = z.object({
  id: z.string().uuid(), status: z.literal("active"), studentUserId: z.string().uuid(),
  guardianUserId: z.string().uuid(), linkedAt: timestamp,
}).refine((value) => value.studentUserId !== value.guardianUserId);
const failureSchema = z.object({
  error: z.enum(["redeem_locked", "code_invalid_or_expired"]),
  lockedUntil: timestamp.nullish(), serverNow: timestamp.optional(), attemptsRemaining: z.number().int().min(0).max(4).optional(),
});
export interface FamilyCodeClient {
  functions: { invoke(name: string, args: {body: Record<string, unknown>}): PromiseLike<{data: unknown; error: unknown}> };
}
export class FamilyCodeError extends Error {
  constructor(readonly code: string, readonly details?: z.infer<typeof failureSchema>) {
    super(familyLinkErrorCopy(code));
  }
}
async function failure(error: unknown): Promise<FamilyCodeError> {
  let details: z.infer<typeof failureSchema> | undefined;
  // Clone before safeFunctionErrorCode consumes the response body.
  if (error && typeof error === "object") {
    const response = Reflect.get(error, "context");
    if (response instanceof Response) {
      try { const parsed = failureSchema.safeParse(await response.clone().json()); if (parsed.success) details = parsed.data; }
      catch { /* An unreadable error never supplies a guessed deadline. */ }
    }
  }
  return new FamilyCodeError(await safeFunctionErrorCode(error), details);
}
export async function issueFamilyCode(client: FamilyCodeClient) {
  const { data, error } = await client.functions.invoke("family-link-issue", {body: {action: "issue"}});
  if (error) throw await failure(error);
  const result = issuedSchema.safeParse(data);
  if (!result.success) throw new FamilyCodeError("function_response_invalid");
  const expiresAt = result.data.codeExpiresAt ?? result.data.expiresAt!;
  if (result.data.serverNow) {
    const remaining = Date.parse(expiresAt) - Date.parse(result.data.serverNow);
    if (remaining <= 0 || remaining > 300_000) throw new FamilyCodeError("function_response_invalid");
  }
  return {code: result.data.code, expiresAt, serverNow: result.data.serverNow};
}
export async function cancelFamilyCode(client: FamilyCodeClient): Promise<void> {
  const {data, error} = await client.functions.invoke("family-link-issue", {body: {action: "cancel"}});
  if (error) throw await failure(error);
  if (!z.object({status: z.literal("revoked"), cancelledCount: z.number().int().min(0)}).safeParse(data).success) {
    throw new FamilyCodeError("function_response_invalid");
  }
}
export async function redeemFamilyCode(code: string, studentId: string, client: FamilyCodeClient): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new Error("6자리 숫자 코드를 입력해 주세요.");
  const {data, error} = await client.functions.invoke("family-link-redeem", {body: {code}});
  if (error) throw await failure(error);
  const result = activeSchema.safeParse(data);
  if (!result.success || result.data.studentUserId !== studentId) throw new FamilyCodeError("function_response_invalid");
}
/** Wall-clock jumps on the device do not extend a code or lock countdown. */
export function estimatedFamilyServerTime(serverAtMs: number, observedAtMs: number, monotonicNowMs: number): number {
  return serverAtMs + Math.max(0, monotonicNowMs - observedAtMs);
}
export function familyCountdownSeconds(deadline: string | null, serverNowMs: number): number {
  if (!deadline || !Number.isFinite(Date.parse(deadline)) || !Number.isFinite(serverNowMs)) return 0;
  return Math.max(0, Math.ceil((Date.parse(deadline) - serverNowMs) / 1000));
}
export function familyCountdownLabel(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
