import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const configuredPath = process.env.MIRUJIMA_E2E_STORAGE_STATE?.trim();
const defaultPath = resolve(process.cwd(), ".auth/user.json");
const candidatePath = configuredPath
  ? (isAbsolute(configuredPath) ? configuredPath : resolve(process.cwd(), configuredPath))
  : defaultPath;

export const AUTH_STORAGE_STATE = existsSync(candidatePath) ? candidatePath : undefined;

export const AUTHENTICATED_ROLE = process.env.MIRUJIMA_E2E_ROLE === "guardian"
  ? "guardian"
  : "student";
