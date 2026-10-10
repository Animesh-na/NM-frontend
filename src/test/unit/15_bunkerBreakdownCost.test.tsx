import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { VoyageProvider, useVoyageContext } from "@/context/VoyageContext";
import { BunkerCalculationPanel } from "@/components/breakdown/BunkerCalculationPanel";
import sheetFixture from "../fixtures/stage3-sheet.json";

const money = (text: string) => Number(text.replace(/[$,]/g, ""));

function Breakdown() {
  const { bunker, results, vessel, sequence } = useVoyageContext();
  return <BunkerCalculationPanel bunker={bunker as never} results={results} vessel={vessel} sequence={sequence} />;
}

// The bunker breakdown priced each fuel at the BOB price while the total used
// the engine's effective (average / FIFO) price, so with a bunkering call the
// per-fuel costs did not add up to "Total Bunker Cost".
describe("bunker breakdown: per-fuel costs use the engine's effective price", () => {
  afterEach(() => cleanup());

  it.each(["average", "fifo"] as const)("per-fuel costs add up to the total (%s)", (fuelMode) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sheet = JSON.parse(JSON.stringify({ ...(sheetFixture as Record<string, unknown>), autoDistanceEnabled: false }));
    sheet.bunker.fuelMode = fuelMode;
    render(<VoyageProvider initialData={sheet}><Breakdown /></VoyageProvider>);

    const block = screen.getByText("Bunker Cost (Consumption × Price)").parentElement!;
    const cards = Array.from(block.querySelectorAll(".grid > div"));
    const [hsfo, vlsfo, lsmgo, total] = cards.map((c) => money(c.querySelector(".font-mono")!.textContent!));
    // Rows are rounded to cents for display; allow 1 cent per fuel.
    expect(Math.abs(hsfo + vlsfo + lsmgo - total)).toBeLessThanOrEqual(0.03);
    // The fixture's bunkering lot is priced differently from BOB, so the old
    // BOB-priced rows would not have matched.
    expect(sheet.bunker.portBunkering[0].vlsfo.price).not.toBe(sheet.bunker.vlsfo.price);
  });
});
