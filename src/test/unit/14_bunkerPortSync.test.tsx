import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { VoyageProvider, useVoyageContext } from "@/context/VoyageContext";
import { BunkerSection } from "@/components/voyage/BunkerSection";
import sheetFixture from "../fixtures/stage3-sheet.json";

vi.mock("@/services/marineApi", () => ({ getBunkerPrices: vi.fn(async () => null) }));

type Ctx = ReturnType<typeof useVoyageContext>;

function mount(sheet: Record<string, unknown>) {
  let ctx: Ctx | null = null;
  function Probe() { ctx = useVoyageContext(); return null; }
  render(<VoyageProvider initialData={sheet}><BunkerSection /><Probe /></VoyageProvider>);
  return () => ctx!;
}

const lots = (c: Ctx) => c.bunker.portBunkering.map((p) => p.portUnloc);
const fresh = () => JSON.parse(JSON.stringify({ ...(sheetFixture as Record<string, unknown>), autoDistanceEnabled: false }));

describe("bunker price rows follow the bunkering calls of the sequence", () => {
  afterEach(() => cleanup());
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  it("a loaded sheet keeps exactly its one row", () => {
    const ctx = mount(fresh());
    expect(lots(ctx())).toEqual(["NLRTM"]);
  });

  it("selecting bkrg on a port row adds exactly one row for that port", () => {
    const ctx = mount(fresh());
    const disch = ctx().sequence.find((r) => r.operation === "discharging")!;
    act(() => ctx().updateSequenceRow(disch.id, "operation", "bunkering"));
    expect(lots(ctx()).sort()).toEqual(["BEANR", "NLRTM"]);
  });

  it("switching a row to bkrg, away and back again leaves one row", () => {
    const ctx = mount(fresh());
    const disch = ctx().sequence.find((r) => r.operation === "discharging")!;
    act(() => ctx().updateSequenceRow(disch.id, "operation", "bunkering"));
    act(() => ctx().updateSequenceRow(disch.id, "operation", "discharging"));
    act(() => ctx().updateSequenceRow(disch.id, "operation", "bunkering"));
    expect(lots(ctx()).sort()).toEqual(["BEANR", "NLRTM"]);
  });

  // CURRENT BEHAVIOUR, pending a product decision (one price row per port, or
  // per bunkering call?): a same-port call added later gets NO row of its own,
  // but two same-port calls that appear at once (sheet load, JSON import) get
  // one row EACH. With prices only, a duplicated row counts that price twice in
  // the average. Update these two tests when the rule is decided.
  it("current: a second same-port call added later shares the existing row", () => {
    const ctx = mount(fresh());
    act(() => ctx().addPort("bunkering"));
    const added = ctx().sequence[ctx().sequence.length - 1];
    act(() => ctx().setSequence((prev) => prev.map((r) => (r.id === added.id ? { ...r, port: "Rotterdam", portUnloc: "NLRTM" } : r))));
    expect(lots(ctx())).toEqual(["NLRTM"]);
  });

  it("current: two same-port calls that appear together get one row each", () => {
    const sheet = fresh();
    sheet.bunker.portBunkering = [];
    sheet.sequence.push({ ...sheet.sequence[2], id: 99 });
    const ctx = mount(sheet);
    expect(lots(ctx())).toEqual(["NLRTM", "NLRTM"]);
  });

  it("changing the port of a bunkering call moves its row", () => {
    const ctx = mount(fresh());
    const bkrg = ctx().sequence.find((r) => r.operation === "bunkering")!;
    act(() => ctx().setSequence((prev) => prev.map((r) => (r.id === bkrg.id ? { ...r, port: "Gibraltar", portUnloc: "GIGIB" } : r))));
    expect(lots(ctx())).toEqual(["GIGIB"]);
  });
});
