import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const roots = [resolve("dist"), resolve("apps/web/.next/static")];
const forbidden = [
  { name: "Toss secret key", pattern: /\b(?:test|live)_(?:sk|gsk)_[A-Za-z0-9_-]{6,}/g },
  // Client keys are public, but a live key in a test artifact is a mode leak.
  ...(process.env.NEXT_PUBLIC_TOSS_PAYMENT_MODE === "live" ? [] : [
    { name: "Toss live client key in non-live build", pattern: /\blive_(?:ck|gck)_[A-Za-z0-9_-]{6,}/g }
  ]),
  { name: "Groq secret key", pattern: /\bgsk_[A-Za-z0-9_-]{12,}/g },
  { name: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{12,}/g },
  { name: "server-only environment name", pattern: /\b(?:TOSS_SECRET_KEY|AI_PROVIDER_API_KEY|GROQ_API_KEY|MIRUJIMA_SERVER_SIGNING_SECRET|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY|MIRUJIMA_PUSH_DISPATCH_SECRET)\b/g },
  { name: "private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const missing = [];
const files = [];
for (const root of roots) {
  try {
    if ((await stat(root)).isDirectory()) files.push(...await collectFiles(root));
  } catch {
    missing.push(root);
  }
}

if (missing.length > 0) {
  process.stderr.write(`공개 번들 검사 전에 빌드가 필요합니다: ${missing.join(", ")}\n`);
  process.exit(1);
}

const findings = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const rule of forbidden) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(content)) findings.push(`${rule.name}: ${file}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`공개 번들에서 서버 비밀 패턴을 발견했습니다:\n${findings.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`공개 번들 비밀 패턴 검사 통과 (${files.length}개 파일)\n`);
