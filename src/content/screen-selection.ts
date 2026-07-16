import type { ExtensionMessage } from "../shared/types/messages";
import type { ScreenSelection } from "../features/writing-assistant/types";

type ApplyTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;
let applyTarget: ApplyTarget | null = null;
let selecting = false;

function editableTarget(value: Element | null): ApplyTarget | null {
  if (value instanceof HTMLTextAreaElement) return value;
  if (value instanceof HTMLInputElement && ["text", "search", "email", "url", "tel"].includes(value.type)) return value;
  if (value instanceof HTMLElement && value.isContentEditable) return value;
  return null;
}

export function beginScreenSelection(): Promise<ScreenSelection> {
  if (selecting) return Promise.reject(new Error("이미 화면 영역을 선택하고 있습니다."));
  selecting = true;
  applyTarget = editableTarget(document.activeElement);
  return new Promise((resolve, reject) => {
    const host = document.createElement("div");
    host.dataset.mirujimaScreenSelector = "true";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `:host{all:initial}.veil{position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(8,18,14,.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.tip{position:fixed;left:50%;top:18px;transform:translateX(-50%);padding:10px 14px;border-radius:999px;background:#fff;color:#173c30;font:700 13px/1.2 sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.22)}.box{position:fixed;border:2px solid #ffcf5c;background:rgba(255,255,255,.12);box-shadow:0 0 0 9999px rgba(8,18,14,.32);pointer-events:none}.cancel{position:fixed;right:18px;top:18px;border:0;border-radius:10px;padding:10px 13px;background:#fff;color:#173c30;font:700 13px sans-serif;cursor:pointer}`;
    const veil = document.createElement("div");
    veil.className = "veil";
    veil.innerHTML = `<div class="tip">교정할 글이 보이는 영역을 드래그하세요 · Esc 취소</div><button class="cancel" type="button">취소</button><div class="box" hidden></div>`;
    shadow.append(style, veil);
    document.documentElement.appendChild(host);
    const box = veil.querySelector<HTMLDivElement>(".box")!;
    const cancel = veil.querySelector<HTMLButtonElement>(".cancel")!;
    let startX = 0; let startY = 0; let dragging = false;

    const cleanup = () => {
      selecting = false;
      window.removeEventListener("keydown", onKey, true);
      host.remove();
    };
    const fail = (message: string) => { cleanup(); reject(new Error(message)); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); fail("화면 영역 선택을 취소했습니다."); } };
    window.addEventListener("keydown", onKey, true);
    cancel.addEventListener("click", () => fail("화면 영역 선택을 취소했습니다."));
    veil.addEventListener("pointerdown", (event) => {
      if ((event.target as Element).closest(".cancel")) return;
      event.preventDefault();
      dragging = true;
      startX = event.clientX; startY = event.clientY;
      box.hidden = false;
      veil.setPointerCapture(event.pointerId);
    });
    veil.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const left = Math.min(startX, event.clientX); const top = Math.min(startY, event.clientY);
      box.style.left = `${left}px`; box.style.top = `${top}px`;
      box.style.width = `${Math.abs(event.clientX - startX)}px`; box.style.height = `${Math.abs(event.clientY - startY)}px`;
    });
    veil.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      const x = Math.min(startX, event.clientX); const y = Math.min(startY, event.clientY);
      const width = Math.abs(event.clientX - startX); const height = Math.abs(event.clientY - startY);
      if (width < 8 || height < 8) { box.hidden = true; return; }
      const result: ScreenSelection = {
        x, y, width, height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        canApply: Boolean(applyTarget?.isConnected)
      };
      cleanup();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(result)));
    });
  });
}

function setNativeValue(target: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(target, text); else target.value = text;
}

export function applyWritingText(text: string): void {
  if (!applyTarget?.isConnected) throw new Error("적용할 입력창을 찾지 못했습니다. 복사 후 직접 붙여넣어 주세요.");
  if (applyTarget instanceof HTMLInputElement || applyTarget instanceof HTMLTextAreaElement) setNativeValue(applyTarget, text);
  else applyTarget.textContent = text;
  applyTarget.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  applyTarget.dispatchEvent(new Event("change", { bubbles: true }));
  applyTarget.focus();
}

export function registerScreenSelectionMessages(): void {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "AI_BEGIN_SELECTION") {
      void beginScreenSelection().then((data) => sendResponse({ ok: true, data })).catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "영역을 선택하지 못했습니다." }));
      return true;
    }
    if (message.type === "AI_APPLY_TEXT") {
      try { applyWritingText(message.text); sendResponse({ ok: true, data: { applied: true } }); }
      catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : "입력창에 적용하지 못했습니다." }); }
    }
    return false;
  });
}
