import { describe, expect, it } from "vitest";
import { applyOps, diffDocuments, planPatch } from "@/session/patchDiff";
import { projectDocument, validateOp } from "@/session/patchAllowlist";

const base = { vessel: { name: "V", dwt: 81000 }, sequence: [{ id: 1, distance: 100 }, { id: 2 }], hireRate: 15000 };

describe("patch diff", () => {
  it("coalesces several field changes into one set of ops", () => {
    const next = { ...base, vessel: { name: "W", dwt: 82000 }, hireRate: 16000 };
    const ops = diffDocuments(base, next);
    expect(ops).toEqual([
      { op: "set", path: "/vessel/name", value: "W" },
      { op: "set", path: "/vessel/dwt", value: 82000 },
      { op: "set", path: "/hireRate", value: 16000 },
    ]);
    expect(applyOps(base, ops)).toEqual(next);
  });

  it("diffs equal-length arrays per element and replaces resized arrays", () => {
    expect(diffDocuments(base, { ...base, sequence: [{ id: 1, distance: 120 }, { id: 2 }] }))
      .toEqual([{ op: "set", path: "/sequence/0/distance", value: 120 }]);
    const grown = { ...base, sequence: [...base.sequence, { id: 3 }] };
    expect(diffDocuments(base, grown)).toEqual([{ op: "set", path: "/sequence", value: grown.sequence }]);
  });

  it("removes deleted fields", () => {
    const { hireRate: _h, ...rest } = base;
    void _h;
    expect(diffDocuments(base, rest)).toEqual([{ op: "remove", path: "/hireRate" }]);
  });

  it("holds back intermediate invalid input (e.g. '13.') instead of sending it", () => {
    const plan = planPatch(base, { ...base, hireRate: "13." as unknown as number, vessel: { name: "X", dwt: 81000 } });
    expect(plan.ops).toEqual([{ op: "set", path: "/vessel/name", value: "X" }]);
    expect(plan.held.map((o) => o.path)).toEqual(["/hireRate"]);
  });

  it("validates with the server allowlist (types, enums, finite numbers, unknown fields)", () => {
    expect(validateOp({ op: "set", path: "/vessel/dwt", value: 82000 })).toBeNull();
    expect(validateOp({ op: "set", path: "/vessel/dwt", value: Number.NaN })).not.toBeNull();
    expect(validateOp({ op: "set", path: "/vessel/dwt", value: 1e13 })).not.toBeNull();
    expect(validateOp({ op: "set", path: "/vessel/speedProfile", value: "turbo" })).not.toBeNull();
    expect(validateOp({ op: "set", path: "/organization_id", value: "x" })).not.toBeNull();
    expect(validateOp({ op: "set", path: "/sequence/0", value: { id: 1, evil: true } })).not.toBeNull();
    expect(validateOp({ op: "set", path: "/cargos/0/cpOverrides/abc", value: {} })).not.toBeNull();
  });

  it("projects a document onto the contract", () => {
    const dropped: string[] = [];
    expect(projectDocument({ ...base, uiOnly: 1, vessel: { name: "V", dwt: 1, junk: true } }, dropped))
      .toEqual({ ...base, vessel: { name: "V", dwt: 1 } });
    expect(dropped.sort()).toEqual(["/uiOnly", "/vessel/junk"]);
  });
});
