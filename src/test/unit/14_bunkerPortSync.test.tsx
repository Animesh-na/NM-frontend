import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { VoyageProvider, useVoyageContext } from "@/context/VoyageContext";
import { BunkerSection } from "@/components/voyage/BunkerSection";
import { bunkerLotLabels, syncBunkerLots } from "@/utils/fuelBreakdown";
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
const setPort = (c: Ctx, id: number, port: string, portUnloc: string) =>
  act(() => c.setSequence((prev) => prev.map((r) => (r.id === id ? { ...r, port, portUnloc } : r))));

// D-065: one bunker price row per bunkering call, paired with the calls in
// voyage order the way the engine pairs them.
describe("bunker price rows: one per bunkering call", () => {
  afterEach(() => cleanup());
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  it("a loaded sheet keeps its row and its prices", () => {
    const ctx = mount(fresh());
    expect(lots(ctx())).toEqual(["NLRTM"]);
    expect(ctx().bunker.portBunkering[0].vlsfo.price).toBe(501.71);
  });

  it("selecting bkrg on a port row adds exactly one row for that port, in voyage order", () => {
    const ctx = mount(fresh());
    const disch = ctx().sequence.find((r) => r.operation === "discharging")!;
    act(() => ctx().updateSequenceRow(disch.id, "operation", "bunkering"));
    expect(lots(ctx())).toEqual(["NLRTM", "BEANR"]);
  });

  it("switching a row to bkrg, away and back again leaves one row", () => {
    const ctx = mount(fresh());
    const disch = ctx().sequence.find((r) => r.operation === "discharging")!;
    act(() => ctx().updateSequenceRow(disch.id, "operation", "bunkering"));
    act(() => ctx().updateSequenceRow(disch.id, "operation", "discharging"));
    act(() => ctx().updateSequenceRow(disch.id, "operation", "bunkering"));
    expect(lots(ctx())).toEqual(["NLRTM", "BEANR"]);
  });

  it("a second call at the same port added later gets its own row; the first keeps its prices", () => {
    const ctx = mount(fresh());
    act(() => ctx().addPort("bunkering"));
    setPort(ctx(), ctx().sequence[ctx().sequence.length - 1].id, "Rotterdam", "NLRTM");
    expect(lots(ctx())).toEqual(["NLRTM", "NLRTM"]);
    expect(ctx().bunker.portBunkering.map((p) => p.vlsfo.price)).toEqual([501.71, 0]);
    expect(screen.getByText("Rotterdam (call 1)")).toBeTruthy();
    expect(screen.getByText("Rotterdam (call 2)")).toBeTruthy();
  });

  it("two same-port calls that appear together get one row each", () => {
    const sheet = fresh();
    sheet.bunker.portBunkering = [];
    sheet.sequence.push({ ...sheet.sequence[2], id: 99 });
    const ctx = mount(sheet);
    expect(lots(ctx())).toEqual(["NLRTM", "NLRTM"]);
  });

  it("removing one of two same-port calls leaves one row", () => {
    const sheet = fresh();
    sheet.sequence.push({ ...sheet.sequence[2], id: 99 });
    const ctx = mount(sheet);
    expect(lots(ctx())).toEqual(["NLRTM", "NLRTM"]);
    act(() => ctx().updateSequenceRow(99, "operation", "discharging"));
    expect(lots(ctx())).toEqual(["NLRTM"]);
    expect(ctx().bunker.portBunkering[0].vlsfo.price).toBe(501.71);
  });

  it("a saved sheet with more rows than calls is trimmed to one row per call", () => {
    const sheet = fresh();
    const dup = { ...sheet.bunker.portBunkering[0], id: 2, vlsfo: { quantity: 0, price: 999 } };
    sheet.bunker.portBunkering.push(dup);
    const ctx = mount(sheet);
    expect(lots(ctx())).toEqual(["NLRTM"]);
    expect(ctx().bunker.portBunkering[0].vlsfo.price).toBe(501.71);
  });

  it("changing the port of a call replaces its row; the new port does not inherit prices", () => {
    const ctx = mount(fresh());
    const bkrg = ctx().sequence.find((r) => r.operation === "bunkering")!;
    setPort(ctx(), bkrg.id, "Gibraltar", "GIGIB");
    expect(lots(ctx())).toEqual(["GIGIB"]);
    expect(ctx().bunker.portBunkering[0].vlsfo.price).toBe(0);
  });
});

describe("syncBunkerLots", () => {
  const lot = (portUnloc: string, portName: string, id: number) => ({ id, portUnloc, portName });
  const make = (c: { portUnloc: string; port: string }) => lot(c.portUnloc, c.port, 0);

  it("returns the same array when lots already match the calls", () => {
    const current = [lot("SGSIN", "Singapore", 1), lot("SGSIN", "Singapore", 2)];
    const calls = [{ portUnloc: "SGSIN", port: "Singapore" }, { portUnloc: "SGSIN", port: "Singapore" }];
    expect(syncBunkerLots(calls, current, make)).toBe(current);
  });

  it("is idempotent", () => {
    const calls = [{ portUnloc: "SGSIN", port: "Singapore" }, { portUnloc: "", port: "Fujairah" }];
    const once = syncBunkerLots(calls, [], make);
    expect(syncBunkerLots(calls, once, make)).toBe(once);
  });

  it("matches a call without UN/LOCODE by port name", () => {
    const current = [lot("", "Fujairah", 1)];
    expect(syncBunkerLots([{ portUnloc: "", port: "fujairah " }], current, make)).toBe(current);
  });

  it("labels repeated ports by call number", () => {
    expect(bunkerLotLabels([lot("SGSIN", "Singapore", 1), lot("NLRTM", "Rotterdam", 2), lot("SGSIN", "Singapore", 3)]))
      .toEqual(["Singapore (call 1)", "Rotterdam", "Singapore (call 2)"]);
  });
});
