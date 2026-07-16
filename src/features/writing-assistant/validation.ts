import type { ContentSummaryResult, OcrResult, WritingResult } from "./types";

const BLOCK_TYPES = ["heading", "paragraph", "list-item", "table", "formula", "other"];

export function isOcrResult(value: unknown): value is OcrResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<OcrResult>;
  return typeof result.text === "string" && result.text.trim().length > 0 && Array.isArray(result.blocks) && result.blocks.length > 0
    && result.blocks.every((block) => block && typeof block.id === "string" && BLOCK_TYPES.includes(block.type)
      && typeof block.text === "string" && block.text.trim().length > 0);
}

export function isWritingResult(value: unknown): value is WritingResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<WritingResult>;
  return typeof result.original === "string" && typeof result.corrected === "string" && typeof result.polished === "string"
    && Array.isArray(result.changes) && result.changes.every((change) => change && ["grammar", "spelling", "spacing", "style", "clarity"].includes(change.type)
      && typeof change.before === "string" && typeof change.after === "string" && typeof change.reason === "string");
}

export function isContentSummaryResult(value: unknown, expectedMode?: ContentSummaryResult["mode"], validBlockIds?: Set<string>): value is ContentSummaryResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ContentSummaryResult>;
  const referencesValid = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.length > 0
    && ids.every((id) => typeof id === "string" && (!validBlockIds || validBlockIds.has(id)));
  return (result.mode === "content-summary" || result.mode === "study-organize")
    && (!expectedMode || result.mode === expectedMode)
    && typeof result.title === "string" && result.title.trim().length > 0
    && typeof result.summary === "string" && result.summary.trim().length > 0
    && Array.isArray(result.keyPoints) && result.keyPoints.length >= 3 && result.keyPoints.length <= 5
    && result.keyPoints.every((item) => item && typeof item.text === "string" && item.text.trim().length > 0 && referencesValid(item.sourceBlockIds))
    && Array.isArray(result.sections) && result.sections.every((section) => section && typeof section.heading === "string"
      && typeof section.content === "string" && referencesValid(section.sourceBlockIds))
    && Array.isArray(result.uncertainItems) && result.uncertainItems.every((item) => typeof item === "string");
}
