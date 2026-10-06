/**
 * Frontend golden runner (M1). For every calc.v1 golden scenario it runs the
 * EXISTING frontend calculation — the real VoyageProvider mounted on the saved
 * sheet, exactly as the app does, with network calls disabled — and writes the
 * normalised result next to the input as <name>.expected.json.
 *
 *   npm run golden:update            (GOLDEN_DIR overrides the scenario folder)
 *
 * Determinism: the clock is fixed to the scenario's calculation_date (noon UTC,
 * D-012), the sector mode follows the envelope's segment, and port lookups /
 * distance fetches are stubbed so stored sheet values are used as-is.
 */
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { VoyageProvider, useVoyageContext } from "@/context/VoyageContext";
import { setApiMode } from "@/services/apiMode";
import { calculateDraftRestriction, estimateCubicFromDwt, type DraftCheckInput } from "@/utils/draftRestriction";
import { estimateTpc } from "@/data/vessels";
import { toResultDTO } from "@/contracts/calc/normalize";
import type { CalculationInput } from "@/contracts/calc/types.generated";

vi.mock("@/services/marineApi", async (orig) => ({
  ...(await orig<typeof import("@/services/marineApi")>()),
  getSeaRouteDistance: vi.fn(async () => {
    throw new Error("network disabled in golden runner");
  }),
  searchPorts: vi.fn(async () => []),
}));

const GOLDEN_DIR = path.resolve(
  process.env.GOLDEN_DIR ?? "../voyage-backend/internal/voyagecalc/testdata/golden",
);

interface ManifestEntry {
  name: string;
  path: string;
  domains: string[];
}
type FunctionScenario =
  | { kind: "function"; function: "calculateDraftRestriction"; input: DraftCheckInput }
  | { kind: "function"; function: "estimateCubicFromDwt" | "estimateTpc"; input: { dwt: number } };

function runFunction(sc: FunctionScenario): unknown {
  switch (sc.function) {
    case "calculateDraftRestriction":
      return calculateDraftRestriction(sc.input);
    case "estimateCubicFromDwt":
      return estimateCubicFromDwt(sc.input.dwt);
    case "estimateTpc":
      return estimateTpc(sc.input.dwt);
  }
}

const frontendCommit = (() => {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain -- src", { encoding: "utf8" }).trim() !== "";
    return dirty ? `${sha}+dirty` : sha;
  } catch {
    return "unknown";
  }
})();

const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, "manifest.json"), "utf8")).scenarios;

async function settle(read: () => unknown) {
  // Let mount effects (derived-row recalculation, stubbed port lookups) run
  // until the result stops changing.
  let last = "";
  for (let i = 0; i < 50; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const now = JSON.stringify(read());
    if (now === last) return;
    last = now;
  }
  throw new Error("frontend result did not settle");
}

async function runSheet(input: CalculationInput) {
  if (!input.calculation_date) throw new Error("golden scenarios must set calculation_date (D-012)");
  vi.setSystemTime(new Date(`${input.calculation_date}T12:00:00Z`));
  setApiMode(input.segment === "tanker" ? "tanker" : "dry-bulk");
  let results: unknown;
  function Probe() {
    results = useVoyageContext().results;
    return null;
  }
  render(
    <VoyageProvider initialData={input.sheet as unknown as Record<string, unknown>}>
      <Probe />
    </VoyageProvider>,
  );
  await settle(() => results);
  cleanup();
  return toResultDTO(results);
}

describe("golden: frontend runner", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    vi.useRealTimers();
    setApiMode("dry-bulk");
  });

  for (const entry of manifest) {
    it(entry.path, async () => {
      const base = path.join(GOLDEN_DIR, entry.path);
      const input = JSON.parse(fs.readFileSync(`${base}.input.json`, "utf8")) as CalculationInput | FunctionScenario;
      let body: Record<string, unknown>;
      if ("kind" in input && input.kind === "function") {
        body = { result: runFunction(input) };
      } else {
        const { result, non_finite } = await runSheet(input as CalculationInput);
        body = { result, non_finite };
      }
      const out = { generated_by: `cozy-crafting-cloud@${frontendCommit} src/golden/runner.golden.tsx`, ...body };
      fs.writeFileSync(`${base}.expected.json`, JSON.stringify(out, null, 2) + "\n");
    });
  }
});
