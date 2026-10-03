import { describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { VoyageProvider, useVoyageContext } from "@/context/VoyageContext";
import sheetFixture from "../fixtures/stage3-sheet.json";

function mount(sheet: Record<string, unknown>) {
  let ctx: ReturnType<typeof useVoyageContext> | null = null;
  function Probe() { ctx = useVoyageContext(); return null; }
  render(<VoyageProvider initialData={sheet}><Probe /></VoyageProvider>);
  return () => ctx!;
}
const pick = (r: Record<string, unknown>) => ({ totalSeaDays: r.totalSeaDays, totalPortDays: r.totalPortDays, totalVoyageDays: r.totalVoyageDays, seaDaysBallast: r.seaDaysBallast, seaDaysLaden: r.seaDaysLaden, pAndL: r.pAndL });

// X-015 (RESOLVED, D-056): edits that change leg times recompute the derived row
// values, so the browser after an edit equals a fresh load of the same sheet —
// which is also what the Go engine computes (it recomputes leg times).
describe("X-015: derived leg times after sequence edits", () => {
  it("removing the only loading row gives the same rows and results as a fresh load of the resulting sheet", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sheet = { ...(sheetFixture as Record<string, unknown>), autoDistanceEnabled: false };
    const ctx = mount(sheet);
    const load = ctx().sequence.find((r) => (r as unknown as { operation?: string }).operation === "loading")!;
    act(() => ctx().removeSequence(load.id));
    const edited = ctx();
    const doc = { ...sheet, sequence: edited.sequence };
    const editedRows = edited.sequence.map((r) => ({ type: r.type, seaTime: r.seaTime, totalLegTime: r.totalLegTime, legArrivalUtc: r.legArrivalUtc }));
    const editedRes = pick(edited.results as unknown as Record<string, unknown>);
    cleanup();
    const fresh = mount(JSON.parse(JSON.stringify(doc)))();
    const freshRows = fresh.sequence.map((r) => ({ type: r.type, seaTime: r.seaTime, totalLegTime: r.totalLegTime, legArrivalUtc: r.legArrivalUtc }));
    const freshRes = pick(fresh.results as unknown as Record<string, unknown>);
    expect({ rows: editedRows, res: editedRes }).toEqual({ rows: freshRows, res: freshRes });
  });
});
