import process from "node:process";
import { readFileSync } from "node:fs";
import { inspectDeploymentConfig } from "./deployment-config.mjs";

try {
  const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
  const checks = inspectDeploymentConfig(process.env, manifest);
  process.stdout.write(JSON.stringify({ scope: "configuration-only", checks }, null, 2) + "\n");
  process.exitCode = checks.every((check) => check.passed) ? 0 : 1;
} catch {
  process.stderr.write("배포 설정 점검 실패: production 확장 빌드와 환경변수를 확인해 주세요.\n");
  process.exitCode = 1;
}
