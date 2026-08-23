export class OfflineActionError extends Error {
  constructor(action: string) {
    super(`오프라인에서는 ${action}을(를) 시작할 수 없습니다. 연결이 복구된 뒤 다시 시도해 주세요.`);
    this.name = "OfflineActionError";
  }
}

export function isOnline(source: { onLine: boolean } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  return source?.onLine !== false;
}

export function requireOnlineAction(action: string, source?: { onLine: boolean }): void {
  if (!isOnline(source)) throw new OfflineActionError(action);
}
