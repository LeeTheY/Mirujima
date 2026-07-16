export type WritingStyle = "proofread" | "natural" | "concise";
export type WritingTask = "grammar-correction" | "content-summary" | "study-organize";
export type OcrBlockType = "heading" | "paragraph" | "list-item" | "table" | "formula" | "other";

export interface OcrBlock {
  id: string;
  type: OcrBlockType;
  text: string;
}

export interface OcrResult {
  text: string;
  blocks: OcrBlock[];
}

export interface ScreenSelection {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  canApply: boolean;
}

export interface ScreenCaptureResult {
  imageDataUrl: string;
  width: number;
  height: number;
  byteSize: number;
  targetTabId: number;
  canApply: boolean;
}

export interface WritingChange {
  type: "grammar" | "spelling" | "spacing" | "style" | "clarity";
  before: string;
  after: string;
  reason: string;
}

export interface WritingResult {
  original: string;
  corrected: string;
  polished: string;
  changes: WritingChange[];
}

export interface ContentSummaryResult {
  title: string;
  mode: "content-summary" | "study-organize";
  keyPoints: Array<{ text: string; sourceBlockIds: string[] }>;
  summary: string;
  sections: Array<{ heading: string; content: string; sourceBlockIds: string[] }>;
  uncertainItems: string[];
}

export interface DiffPart {
  value: string;
  type: "same" | "added" | "removed";
}
