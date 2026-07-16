import type { DiffPart } from "./types";

function tokens(value: string): string[] {
  return value.match(/\s+|[^\s]+/gu) ?? [];
}

export function textDiff(before: string, after: string): DiffPart[] {
  const left = tokens(before);
  const right = tokens(after);
  const table = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) for (let j = right.length - 1; j >= 0; j -= 1) {
    table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const parts: DiffPart[] = [];
  const append = (value: string, type: DiffPart["type"]) => {
    const last = parts.at(-1);
    if (last?.type === type) last.value += value; else parts.push({ value, type });
  };
  let i = 0; let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { append(left[i], "same"); i += 1; j += 1; }
    else if (j < right.length && (i === left.length || table[i][j + 1] >= table[i + 1][j])) { append(right[j], "added"); j += 1; }
    else { append(left[i], "removed"); i += 1; }
  }
  return parts;
}
