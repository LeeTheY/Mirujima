import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./config";

export function createClient() {
  const config = getSupabasePublicConfig();
  return createBrowserClient(config.url, config.publishableKey);
}
