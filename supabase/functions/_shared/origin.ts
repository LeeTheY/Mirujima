function canonicalOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function allowedOrigin(requestOrigin: string, configured: string | undefined): string | null {
  const requested = canonicalOrigin(requestOrigin);
  if (!requested || !configured) return null;
  const allowed = configured.split(",").map(canonicalOrigin).filter((value): value is string => value !== null);
  return allowed.includes(requested) ? requested : null;
}
