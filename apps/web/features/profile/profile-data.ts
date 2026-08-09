import { createClient } from "@/lib/supabase/server";
import { profileDisplayName } from "./profile-display";

export async function loadOwnDisplayName(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return error ? profileDisplayName(null) : profileDisplayName(data?.display_name);
}
