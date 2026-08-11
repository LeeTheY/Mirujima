import { createClient } from "@/lib/supabase/server";

export async function loadStudentHasActiveGuardian(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("family_links")
    .select("guardian_user_id")
    .eq("student_user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  return !error && typeof data?.guardian_user_id === "string";
}
