/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_PREMIUM_MONTHLY_PRICE_LABEL?: string;
  readonly VITE_WEB_APP_ORIGIN?: string;
}
