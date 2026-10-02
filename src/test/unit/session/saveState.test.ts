import { describe, expect, it } from "vitest";
import { SAVE_EVENT_TYPES, SAVE_STATES, TRANSITIONS, saveReducer, type SaveEvent, type SaveState } from "@/session/saveState";

const events: SaveEvent[] = SAVE_EVENT_TYPES.flatMap((type) =>
  ["PATCH_ACKED", "RESULT", "SAVE_COMPLETED", "CONFLICT_RESOLVED", "RESUMED"].includes(type)
    ? [{ type, dirty: true } as SaveEvent, { type, dirty: false } as SaveEvent]
    : [{ type } as SaveEvent],
);

describe("save state machine", () => {
  it("defines every (state, event) pair", () => {
    for (const s of SAVE_STATES) {
      expect(Object.keys(TRANSITIONS[s]).sort()).toEqual([...SAVE_EVENT_TYPES].sort());
    }
  });

  it("only ever leads to valid states", () => {
    for (const s of SAVE_STATES) for (const e of events) expect(SAVE_STATES).toContain(saveReducer(s, e));
  });

  it("enters SAVED only on save_completed, an authoritative resume, or a resolved conflict — never on a result or an acknowledged patch", () => {
    for (const s of SAVE_STATES) {
      for (const e of events) {
        const next = saveReducer(s, e);
        if (next === "SAVED" && s !== "SAVED") {
          expect(["SAVE_COMPLETED", "RESUMED", "CONFLICT_RESOLVED"]).toContain(e.type);
          expect((e as { dirty?: boolean }).dirty).toBe(false);
        }
      }
    }
  });

  it("a completed save of an older sequence with newer edits is not SAVED", () => {
    expect(saveReducer("SAVE_PENDING", { type: "SAVE_COMPLETED", dirty: true })).toBe("LOCAL_ONLY");
  });

  it("CONFLICT is sticky until resolved", () => {
    for (const e of events) {
      const next = saveReducer("CONFLICT", e);
      if (e.type !== "CONFLICT_RESOLVED") expect(next).toBe("CONFLICT");
    }
  });

  it("follows the edit → calculate → save path", () => {
    const path: [SaveEvent, SaveState][] = [
      [{ type: "RESUMED", dirty: false }, "SAVED"],
      [{ type: "LOCAL_EDIT" }, "LOCAL_ONLY"],
      [{ type: "PATCH_ACKED", dirty: true }, "CALCULATING"],
      [{ type: "RESULT", dirty: true }, "LOCAL_ONLY"],
      [{ type: "SAVE_STARTED" }, "SAVE_PENDING"],
      [{ type: "SAVE_COMPLETED", dirty: false }, "SAVED"],
      [{ type: "DISCONNECTED" }, "OFFLINE"],
      [{ type: "RECONNECTING" }, "RECOVERING"],
      [{ type: "RESUMED", dirty: false }, "SAVED"],
    ];
    let s: SaveState = "RECOVERING";
    for (const [e, want] of path) {
      s = saveReducer(s, e);
      expect(s).toBe(want);
    }
  });

  it("offline edits stay OFFLINE until resumed; a failed save keeps showing until the next save", () => {
    expect(saveReducer("OFFLINE", { type: "LOCAL_EDIT" })).toBe("OFFLINE");
    expect(saveReducer("OFFLINE", { type: "SAVE_COMPLETED", dirty: false })).toBe("OFFLINE");
    expect(saveReducer("SAVE_FAILED", { type: "LOCAL_EDIT" })).toBe("SAVE_FAILED");
    expect(saveReducer("SAVE_FAILED", { type: "SAVE_STARTED" })).toBe("SAVE_PENDING");
  });
});
