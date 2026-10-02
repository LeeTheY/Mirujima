import process from "node:process";
import { URL } from "node:url";
// Read-only, service-only operational projection. Never print the URL/key or raw HTTP errors.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { process.stderr.write("운영 점검에는 서버 전용 Supabase 환경변수가 필요합니다.\n"); process.exit(1); }
try {
  const endpoint = new URL("/rest/v1/rpc/get_release_operations_snapshot", url);
  if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) throw new Error("invalid origin");
  const response = await globalThis.fetch(endpoint, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_stale_minutes: 30 }), signal: globalThis.AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("projection unavailable");
  const snapshot = await response.json();
  if (!Number.isSafeInteger(snapshot.issueCount) || !Array.isArray(snapshot.items)) throw new Error("invalid snapshot");
  process.stdout.write(JSON.stringify({ checkedAt: snapshot.checkedAt, issueCount: snapshot.issueCount, items: snapshot.items.map((item) => ({ kind: item.kind, entityId: item.entityId, since: item.since })) }, null, 2)+"\n");
  process.exitCode = snapshot.issueCount > 0 ? 2 : 0;
} catch { process.stderr.write("운영 점검을 완료하지 못했습니다. 인증·배포 상태를 확인해 주세요.\n"); process.exitCode = 1; }
