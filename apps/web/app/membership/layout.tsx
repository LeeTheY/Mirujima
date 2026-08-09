import type { ReactNode } from "react";
import { requireAuthenticatedRole } from "@/features/auth/require-role";

export default async function MembershipLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedRole("/membership");
  return children;
}
