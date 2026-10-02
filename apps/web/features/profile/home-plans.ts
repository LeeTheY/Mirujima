import { focusPlanSchema, type FocusPlan } from "@mirujima/contracts";

export function parseHomePlans(rows: unknown, ownerUserId: string): FocusPlan[] | null {
  if (!Array.isArray(rows)) return null;
  const plans: FocusPlan[] = [];
  for (const row of rows) {
    const payload: unknown = row && typeof row === "object" ? Reflect.get(row, "payload") : null;
    // Old local schedules remain supported but are not canonical web plans.
    if (!payload || typeof payload !== "object" || !Reflect.has(payload, "ownerUserId")) continue;
    const parsed = focusPlanSchema.safeParse(payload);
    if (!parsed.success || parsed.data.ownerUserId !== ownerUserId) return null;
    plans.push(parsed.data);
  }
  return plans;
}
