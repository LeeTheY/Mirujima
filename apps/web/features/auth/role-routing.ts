import { userRoleSchema, type UserRole } from "@mirujima/contracts";

export interface RoleSelectionDecision {
  role: UserRole;
  shouldPersist: boolean;
}

export function resolveRoleSelection(
  existingRole: UserRole | null,
  requestedRole: UserRole,
): RoleSelectionDecision {
  return existingRole
    ? { role: existingRole, shouldPersist: false }
    : { role: requestedRole, shouldPersist: true };
}

export function resolvePersistedRole(result: unknown): UserRole | null {
  const role = result && typeof result === "object" && "role" in result
    ? userRoleSchema.safeParse(result.role)
    : { success: false as const };
  return role.success ? role.data : null;
}

export function destinationForRole(role: UserRole | null): string {
  if (role === "student") return "/home";
  if (role === "guardian") return "/guardian";
  return "/login";
}
