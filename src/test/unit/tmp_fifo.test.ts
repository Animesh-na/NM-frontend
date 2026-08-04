import { describe, it, expect } from "vitest";
import { computeFifoCoverage } from "@/utils/fuelBreakdown";
import { buildFuelPricing, effectivePrice } from "@/utils/bunkerPricing";

const vessel: any = {
  speedProfile: "full", hasScrubber: false,
  fullConsumption: {
    hsfo: { laden: 0, ballast: 0, load: 0, discharge: 0, idle: 0 },
    vlsfo: { laden: 30, ballast: 28, load: 5, discharge: 5, idle: 3 },
    lsmgo: { laden: 2, ballast: 2, load: 0, discharge: 0, idle: 0 },
    ae: { laden: 2, ballast: 2, load: 3, discharge: 3, idle: 1 },
    aeScrubber: { laden: 2, ballast: 2, load: 3, discharge: 3, idle: 1 },
  },
};

const rows: any[] = [
  { type: "open", operation: "pssg", port: "A", portUnloc: "AAA" },
  { type: "port", operation: "loading", port: "B", portUnloc: "BBB", seaTime: 5, ecaTime: 0, portDays: 2 },
  { type: "port", operation: "bunkering", port: "C", portUnloc: "CCC", seaTime: 4, ecaTime: 0, portDays: 1 },
  { type: "port", operation: "bunkering", port: "D", portUnloc: "DDD", seaTime: 4, ecaTime: 0, portDays: 1 },
  { type: "port", operation: "discharging", port: "E", portUnloc: "EEE", seaTime: 6, ecaTime: 0, portDays: 2 },
];

describe("fifo multi", () => {
  it("weights", () => {
    const cov = computeFifoCoverage(rows, vessel, ["CCC", "DDD"], 1);
    console.log(cov);
    const bunker: any = {
      hsfo: { price: 0, robStart: 0 }, vlsfo: { price: 500, robStart: 300 }, lsmgo: { price: 800, robStart: 50 },
      fuelMode: "fifo", ignoreBOB: false,
      portBunkering: [
        { portUnloc: "CCC", hsfo: { price: 0, quantity: 0 }, vlsfo: { price: 600, quantity: 0 }, lsmgo: { price: 900, quantity: 0 } },
        { portUnloc: "DDD", hsfo: { price: 0, quantity: 0 }, vlsfo: { price: 700, quantity: 0 }, lsmgo: { price: 1000, quantity: 0 } },
      ],
    };
    const p = effectivePrice(buildFuelPricing(bunker, "vlsfo", cov.vlsfo), 1000);
    console.log("vlsfo eff", p);
    expect(p).toBeGreaterThan(500);
  });
});
