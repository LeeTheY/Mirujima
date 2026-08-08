import { normalizeHostname } from "@mirujima/contracts";
import { z } from "zod";

const focusDraftSchema = z.object({
  title: z.string().trim().min(1, "계획명을 입력해 주세요.").max(120),
  targetFocusMinutes: z.coerce.number().int("집중 시간은 정수여야 합니다.").min(1, "집중 시간은 1분 이상이어야 합니다.").max(720),
  breakMinutes: z.coerce.number().int().min(1).max(120),
  blockingMode: z.enum(["allowlist", "blocklist", "off"]),
  domains: z.string(),
});

export interface FocusDraft {
  title: string;
  targetFocusMinutes: number;
  breakMinutes: number;
  blockingMode: "allowlist" | "blocklist" | "off";
  domains: string[];
}

export function parseFocusDraft(input: unknown): FocusDraft {
  const parsed = focusDraftSchema.parse(input);
  return {
    ...parsed,
    domains: parsed.domains
      .split(/[\n,]/)
      .map((domain) => domain.trim())
      .filter(Boolean)
      .map(normalizeHostname),
  };
}
