import type { ReactNode } from "react";
import { requireAuthenticatedRole } from "@/features/auth/require-role";

export default async function StudentHomeLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedRole("/home");
  return children;
}
