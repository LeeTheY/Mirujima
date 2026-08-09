import type { ReactNode } from "react";
import { requireAuthenticatedRole } from "@/features/auth/require-role";

export default async function StudentFocusLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedRole("/focus");
  return children;
}
