import process from "node:process";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const required = ["studentIntegration", "guardianIntegration", "providerPaymentRefund", "providerAiConsent", "devicePwaPush", "extensionCompatibility", "stagingRecovery"];
try {
  if (!process.env.MIRUJIMA_RELEASE_EVIDENCE) throw new Error("evidence missing");
  const evidence = JSON.parse(await readFile(process.env.MIRUJIMA_RELEASE_EVIDENCE, "utf8"));
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  // Next generates this type declaration during build; it is not product source.
  const changes = execFileSync("git", ["status", "--porcelain", "--", ".", ":(exclude)apps/web/next-env.d.ts"], { encoding: "utf8" }).trim();
  if (changes || evidence.artifactRevision !== revision) throw new Error("release artifact mismatch");
  const age = Date.now() - Date.parse(evidence.verifiedAt);
  if (!/^[a-f0-9]{40}$/.test(evidence.artifactRevision) || !Number.isFinite(age) || age < 0 || age > 7*86400000) throw new Error("stale artifact");
  const missing = required.filter((key) => evidence.checks?.[key]?.status !== "passed" || typeof evidence.checks[key].evidence !== "string" || evidence.checks[key].evidence.trim().length < 10);
  if (missing.length) { process.stderr.write(`실환경 출시 증거 미완료: ${missing.join(", ")}\n`); process.exitCode = 1; }
  else process.stdout.write("실환경 출시 증거 형식·유효기간 확인 완료. 실제 결과의 진위는 운영 담당자가 검토해야 합니다.\n");
} catch { process.stderr.write("유효한 실환경 출시 증거가 없습니다. 로컬 검증은 출시 승인을 대체하지 않습니다.\n"); process.exitCode = 1; }
