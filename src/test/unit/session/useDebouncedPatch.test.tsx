import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH_DEBOUNCE_MS, useDebouncedPatch } from "@/hooks/useVoyageSession";
import type { VoyageSession } from "@/session/voyageSession";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function stubSession() {
  return { update: vi.fn(), flush: vi.fn() } as unknown as VoyageSession & { update: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
}

describe("useDebouncedPatch", () => {
  it("propagates only the last document, once, 200 ms after the last change (trailing)", () => {
    const session = stubSession();
    const { rerender } = renderHook(({ doc }) => useDebouncedPatch(session, doc), { initialProps: { doc: { a: 1 } } });
    rerender({ doc: { a: 2 } });
    act(() => void vi.advanceTimersByTime(150));
    rerender({ doc: { a: 3 } });
    act(() => void vi.advanceTimersByTime(150));
    expect(session.update).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(PATCH_DEBOUNCE_MS));
    expect(session.update).toHaveBeenCalledTimes(1);
    expect(session.update).toHaveBeenLastCalledWith({ a: 3 });
  });

  it("flushes immediately on Enter, blur and page hide", () => {
    const session = stubSession();
    const { rerender } = renderHook(({ doc }) => useDebouncedPatch(session, doc), { initialProps: { doc: { a: 1 } } });
    rerender({ doc: { a: 2 } });
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })));
    expect(session.update).toHaveBeenLastCalledWith({ a: 2 });
    expect(session.flush).toHaveBeenCalled();
    rerender({ doc: { a: 3 } });
    act(() => void window.dispatchEvent(new FocusEvent("focusout")));
    expect(session.update).toHaveBeenLastCalledWith({ a: 3 });
    rerender({ doc: { a: 4 } });
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(session.update).toHaveBeenLastCalledWith({ a: 4 });
  });

  it("does nothing without a session (flag off)", () => {
    const { result, rerender } = renderHook(({ doc }) => useDebouncedPatch(null, doc), { initialProps: { doc: { a: 1 } } });
    rerender({ doc: { a: 2 } });
    act(() => void vi.advanceTimersByTime(1000));
    expect(() => result.current()).not.toThrow();
  });
});
