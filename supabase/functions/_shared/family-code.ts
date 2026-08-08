const CODE_SPACE = 1_000_000;
const UINT32_SPACE = 0x1_0000_0000;
const UNBIASED_LIMIT = Math.floor(UINT32_SPACE / CODE_SPACE) * CODE_SPACE;

export function generateFamilyCode(): string {
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= UNBIASED_LIMIT);
  return String(values[0] % CODE_SPACE).padStart(6, "0");
}

export async function hashFamilyCode(code: string, secret: string): Promise<string> {
  if (!/^\d{6}$/.test(code)) throw new Error("연결 코드는 6자리 숫자여야 합니다.");
  if (secret.length < 24) throw new Error("서버 서명 secret 설정이 올바르지 않습니다.");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(code)));
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
