import { guardianSharingPreferencesSchema, type GuardianSharingPreferences } from "@mirujima/contracts";
import { createClient } from "@/lib/supabase/server";

export async function loadOwnSharingPreferences(userId: string): Promise<GuardianSharingPreferences | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("sharing_preferences").eq("id", userId).maybeSingle();
  const result = guardianSharingPreferencesSchema.safeParse(data?.sharing_preferences);
  return !error && result.success ? result.data : null;
}
