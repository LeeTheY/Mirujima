import type { ReactNode } from "react";
import { requireAuthenticatedRole } from "@/features/auth/require-role";

export default async function StudentHistoryLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedRole("/history");
  return children;
}
