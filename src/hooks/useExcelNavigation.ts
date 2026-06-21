import { useEffect } from "react";

const SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([disabled]):not([readonly])',
  "select:not([disabled])",
  "textarea:not([disabled]):not([readonly])",
  '[contenteditable="true"]',
].join(",");

function getFields(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
  return all.filter((el) => {
    if (el.offsetParent === null && el.tagName !== "SELECT") return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return true;
  });
}

type Dir = "up" | "down" | "left" | "right";

function findNeighbor(current: HTMLElement, dir: Dir): HTMLElement | null {
  const fields = getFields();
  const cRect = current.getBoundingClientRect();
  const cx = cRect.left + cRect.width / 2;
  const cy = cRect.top + cRect.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of fields) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const dx = ex - cx;
    const dy = ey - cy;

    let primary = 0;
    let secondary = 0;
    const ROW_TOL = Math.max(cRect.height, r.height) * 0.6;
    const COL_TOL = Math.max(cRect.width, r.width) * 0.6;

    if (dir === "right") {
      if (dx <= 2) continue;
      if (Math.abs(dy) > ROW_TOL) continue;
      primary = dx;
      secondary = Math.abs(dy) * 4;
    } else if (dir === "left") {
      if (dx >= -2) continue;
      if (Math.abs(dy) > ROW_TOL) continue;
      primary = -dx;
      secondary = Math.abs(dy) * 4;
    } else if (dir === "down") {
      if (dy <= 2) continue;
      primary = dy;
      secondary = Math.abs(dx);
      if (Math.abs(dx) > COL_TOL) secondary *= 1.5;
    } else if (dir === "up") {
      if (dy >= -2) continue;
      primary = -dy;
      secondary = Math.abs(dx);
      if (Math.abs(dx) > COL_TOL) secondary *= 1.5;
    }

    const score = primary + secondary;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function focusEl(el: HTMLElement) {
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    try {
      el.select();
    } catch {
      /* ignore */
    }
  }
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function useExcelNavigation() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      const isField =
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        target.getAttribute("contenteditable") === "true";
      if (!isField) return;

      // Skip text-y inputs where arrow keys should move the caret
      const input = target as HTMLInputElement;
      const type = (input.type || "").toLowerCase();
      const isTextual =
        tag === "TEXTAREA" ||
        (tag === "INPUT" &&
          ["text", "search", "url", "email", "tel", "password", ""].includes(type));

      let dir: Dir | null = null;
      if (e.key === "ArrowUp") dir = "up";
      else if (e.key === "ArrowDown") dir = "down";
      else if (e.key === "ArrowLeft") dir = "left";
      else if (e.key === "ArrowRight") dir = "right";
      else if (e.key === "Enter" && !e.shiftKey) dir = "down";
      else if (e.key === "Enter" && e.shiftKey) dir = "up";
      else return;

      // For textual inputs, allow left/right caret movement; only intercept up/down/Enter
      if (isTextual && (dir === "left" || dir === "right")) {
        const val = input.value ?? "";
        const pos = input.selectionStart ?? 0;
        const endPos = input.selectionEnd ?? 0;
        if (dir === "left" && pos > 0) return;
        if (dir === "right" && endPos < val.length) return;
      }

      const next = findNeighbor(target, dir);
      if (next) {
        e.preventDefault();
        focusEl(next);
      } else if (e.key === "Enter") {
        // Prevent accidental form submit even if no neighbor
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);
}