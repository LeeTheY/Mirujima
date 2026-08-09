import { createClient } from "@/lib/supabase/server";
import { parseLinkedStudents, type LinkedStudent } from "./linked-students";

export async function loadGuardianLinkedStudents(): Promise<{ students: LinkedStudent[]; loadFailed: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_guardian_linked_students");
  return error ? { students: [], loadFailed: true } : { students: parseLinkedStudents(data), loadFailed: false };
}
