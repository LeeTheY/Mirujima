import type { ScreenSelection } from "./types";

export interface CropRectangle { sx: number; sy: number; width: number; height: number }

export function calculateCropRectangle(selection: ScreenSelection, imageWidth: number, imageHeight: number): CropRectangle {
  if (![selection.x, selection.y, selection.width, selection.height, selection.viewportWidth, selection.viewportHeight, imageWidth, imageHeight]
    .every((value) => Number.isFinite(value))) throw new Error("선택 영역 좌표가 올바르지 않습니다.");
  if (selection.width < 8 || selection.height < 8 || selection.viewportWidth <= 0 || selection.viewportHeight <= 0) {
    throw new Error("글자가 포함된 영역을 조금 더 크게 선택해 주세요.");
  }
  const scaleX = imageWidth / selection.viewportWidth;
  const scaleY = imageHeight / selection.viewportHeight;
  const left = Math.max(0, Math.min(selection.viewportWidth, selection.x));
  const top = Math.max(0, Math.min(selection.viewportHeight, selection.y));
  const right = Math.max(left, Math.min(selection.viewportWidth, selection.x + selection.width));
  const bottom = Math.max(top, Math.min(selection.viewportHeight, selection.y + selection.height));
  const sx = Math.floor(left * scaleX);
  const sy = Math.floor(top * scaleY);
  return {
    sx,
    sy,
    width: Math.max(1, Math.min(imageWidth - sx, Math.ceil((right - left) * scaleX))),
    height: Math.max(1, Math.min(imageHeight - sy, Math.ceil((bottom - top) * scaleY)))
  };
}

export function isSupportedCaptureUrl(url: string | undefined): boolean {
  if (!url) return false;
  try { return ["http:", "https:"].includes(new URL(url).protocol); } catch { return false; }
}
