import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const configuredPath = process.env.MIRUJIMA_E2E_STORAGE_STATE?.trim();
const defaultPath = resolve(process.cwd(), ".auth/user.json");
const candidatePath = configuredPath
  ? (isAbsolute(configuredPath) ? configuredPath : resolve(process.cwd(), configuredPath))
  : defaultPath;

export const AUTH_STORAGE_STATE = existsSync(candidatePath) ? candidatePath : undefined;

if (process.env.MIRUJIMA_E2E_REQUIRED === "1" && !AUTH_STORAGE_STATE) {
  throw new Error("릴리스 인증 검증에는 MIRUJIMA_E2E_STORAGE_STATE의 유효한 로그인 상태 파일이 필요합니다.");
}
if (AUTH_STORAGE_STATE) {
  let valid = false;
  try {
    const state: unknown = JSON.parse(readFileSync(AUTH_STORAGE_STATE, "utf8"));
    valid = Boolean(state && typeof state === "object"
      && Array.isArray(Reflect.get(state, "cookies")) && Array.isArray(Reflect.get(state, "origins")));
  } catch { /* Never print malformed authentication contents. */ }
  if (!valid) throw new Error("인증 storage state 형식을 확인할 수 없습니다. 테스트 계정으로 다시 생성해 주세요.");
}

export const AUTHENTICATED_ROLE = process.env.MIRUJIMA_E2E_ROLE === "guardian"
  ? "guardian"
  : "student";
