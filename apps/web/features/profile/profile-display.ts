export function profileDisplayName(value: unknown): string {
  if (typeof value !== "string") return "이름 미설정";
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 100 ? normalized : "이름 미설정";
}
