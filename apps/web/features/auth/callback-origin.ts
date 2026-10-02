export function callbackOrigin(configured: string | undefined, requestOrigin: string): string {
  const origin = configured || requestOrigin;
  const url = new URL(origin);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) throw new Error("Invalid application origin");
  return url.origin;
}
