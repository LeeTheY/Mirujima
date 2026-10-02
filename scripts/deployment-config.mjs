import { URL } from "node:url";

const origin = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
};

// Only return check names and booleans. Configuration values never enter reports.
export function inspectDeploymentConfig(env, manifest) {
  const web = origin(env.NEXT_PUBLIC_APP_ORIGIN);
  const backend = origin(env.NEXT_PUBLIC_SUPABASE_URL);
  const paymentMode = env.NEXT_PUBLIC_TOSS_PAYMENT_MODE ?? "test";
  return [
    { name: "webHttpsOrigin", passed: Boolean(web) },
    { name: "extensionSameOrigin", passed: Boolean(web) && env.VITE_WEB_APP_ORIGIN === web },
    { name: "exactExternalMessagingOrigin", passed: Boolean(web)
      && manifest?.externally_connectable?.matches?.length === 1
      && manifest.externally_connectable.matches[0] === `${web}/*` },
    { name: "sameSupabaseProject", passed: Boolean(backend)
      && env.VITE_SUPABASE_URL === backend },
    { name: "publicSupabaseKey", passed: Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
      && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === env.VITE_SUPABASE_PUBLISHABLE_KEY },
    { name: "publishedExtensionId", passed: /^[a-p]{32}$/.test(env.NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID ?? "") },
    { name: "tossModeAndClientKey", passed: ["test", "live"].includes(paymentMode)
      && new RegExp(`^${paymentMode}_ck_[A-Za-z0-9_-]+$`).test(env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "") },
    { name: "publicVapidKey", passed: /^[A-Za-z0-9_-]{87}$/.test(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "") },
    { name: "manifestV3", passed: manifest?.manifest_version === 3 },
  ];
}

export function localRestoreConfig(env) {
  const host = env.PGHOST;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)
    || !/^\d{1,5}$/.test(env.PGPORT ?? "")
    || Number(env.PGPORT) < 1 || Number(env.PGPORT) > 65535
    || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(env.PGDATABASE ?? "")
    || !env.PGUSER || env.PGSERVICE || env.PGSERVICEFILE || env.PGHOSTADDR) {
    throw new Error("Explicit local PostgreSQL configuration required");
  }
  return { host, port: env.PGPORT, database: env.PGDATABASE, user: env.PGUSER };
}
