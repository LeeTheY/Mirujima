import type { UserRole } from "@mirujima/contracts";

export function destinationForRole(role: UserRole | null): string {
  if (role === "student") return "/home";
  if (role === "guardian") return "/guardian";
  return "/onboarding";
}
