interface RoleSelectionError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

type ErrorLogger = (message: string, context: RoleSelectionError) => void;

export function reportRoleSelectionError(
  error: RoleSelectionError,
  logger: ErrorLogger = console.error,
): string {
  logger("[auth.selectRole] Supabase RPC failed", {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
  return "역할을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
