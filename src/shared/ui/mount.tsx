import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

export function mountApp(node: ReactNode): void {
  const container = document.getElementById("root");
  if (!container) throw new Error("앱을 표시할 root 요소가 없습니다.");
  createRoot(container).render(node);
}
