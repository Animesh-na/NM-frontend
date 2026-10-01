/**
 * Schema-driven normalisation and comparison for calc.v1 results.
 *
 * - toResultDTO: projects the app's VoyageResults onto CalculationResultDTO by
 *   walking the result schema (only schema fields, in a stable key order).
 *   Non-finite numbers, which JSON cannot carry, become 0 and are reported by
 *   path, mirroring the Go side (contract.SanitizeNonFinite).
 * - compareResults: per-field comparison with the schema's x-kind tolerances,
 *   mirroring contract.CompareResults in the Go service (D-011).
 */
import resultSchemaJson from "./calculation-result.v1.schema.json";
import type { CalculationResultDTO } from "./types.generated";

interface SchemaNode {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  "x-kind"?: string;
}

const resultSchema = resultSchemaJson as unknown as SchemaNode & { $defs: Record<string, SchemaNode> };

const resolve = (n: SchemaNode | undefined): SchemaNode | undefined => {
  let node = n;
  while (node?.$ref) node = resultSchema.$defs[node.$ref.replace("#/$defs/", "")];
  return node;
};

export const MONEY_ABS_TOLERANCE = 0.005;
export const REL_TOLERANCE = 1e-9;
export const ABS_FLOOR = 1e-9;

export interface NormalizedResult {
  result: CalculationResultDTO;
  non_finite: Record<string, "NaN" | "Infinity" | "-Infinity">;
}

const join = (base: string, key: string) => (base ? `${base}.${key}` : key);

export function toResultDTO(results: unknown): NormalizedResult {
  const nonFinite: NormalizedResult["non_finite"] = {};
  const walk = (node: SchemaNode | undefined, path: string, value: unknown): unknown => {
    const n = resolve(node);
    if (value === undefined) return undefined;
    if (n?.properties) {
      if (value === null || typeof value !== "object") return value;
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(n.properties).sort()) {
        const v = walk(n.properties[key], join(path, key), src[key]);
        if (v !== undefined) out[key] = v;
      }
      return out;
    }
    if (n?.items) {
      if (!Array.isArray(value)) return value;
      return value.map((v, i) => walk(n.items, `${path}[${i}]`, v));
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      nonFinite[path] = Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity";
      return 0;
    }
    return value;
  };
  const result = walk(resultSchema.$defs.CalculationResultDTO, "", results) as CalculationResultDTO;
  return { result, non_finite: nonFinite };
}

export interface FieldDiff {
  path: string;
  class: "VALUE" | "MISSING_IN_GO" | "MISSING_IN_FRONTEND" | "LENGTH" | "TYPE" | "NOT_COMPUTED" | "NON_FINITE";
  kind?: string;
  abs_diff?: number;
  rel_diff?: number;
}

/** Compares a frontend DTO (expected) with a server DTO. Values are not copied into the diff. */
export function compareResults(frontend: unknown, server: unknown, notComputed: string[] = []): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const isNotComputed = (p: string) =>
    notComputed.some((nc) => p === nc || p.startsWith(`${nc}.`) || p.startsWith(`${nc}[`));
  const add = (d: FieldDiff) => {
    if ((d.class === "VALUE" || d.class === "LENGTH" || d.class === "MISSING_IN_GO") && isNotComputed(d.path)) {
      d.class = "NOT_COMPUTED";
    }
    diffs.push(d);
  };
  const walk = (node: SchemaNode | undefined, path: string, fe: unknown, sv: unknown) => {
    const n = resolve(node);
    if (n?.properties) {
      if (!fe || !sv || typeof fe !== "object" || typeof sv !== "object") {
        if (fe != null || sv != null) add({ path, class: "TYPE" });
        return;
      }
      for (const key of Object.keys(n.properties).sort()) {
        const p = join(path, key);
        const f = (fe as Record<string, unknown>)[key];
        const s = (sv as Record<string, unknown>)[key];
        if (f !== undefined && s === undefined) add({ path: p, class: "MISSING_IN_GO" });
        else if (f === undefined && s !== undefined) add({ path: p, class: "MISSING_IN_FRONTEND" });
        else if (f !== undefined) walk(n.properties[key], p, f, s);
      }
      return;
    }
    if (n?.items) {
      if (!Array.isArray(fe) || !Array.isArray(sv)) {
        add({ path, class: "TYPE" });
        return;
      }
      if (fe.length !== sv.length) add({ path, class: "LENGTH" });
      for (let i = 0; i < Math.min(fe.length, sv.length); i++) walk(n.items, `${path}[${i}]`, fe[i], sv[i]);
      return;
    }
    const kind = n?.["x-kind"] ?? (typeof fe === "number" ? "quantity" : "label");
    if (typeof fe === "number" && typeof sv === "number") {
      const abs = Math.abs(fe - sv);
      const scale = Math.max(Math.abs(fe), Math.abs(sv));
      const rel = scale > 0 ? abs / scale : 0;
      const ok =
        kind === "money" ? abs <= MONEY_ABS_TOLERANCE
        : kind === "count" ? fe === sv
        : abs <= Math.max(REL_TOLERANCE * scale, ABS_FLOOR);
      if (!ok) add({ path, class: "VALUE", kind, abs_diff: abs, rel_diff: rel });
      return;
    }
    if (String(fe) !== String(sv) || typeof fe !== typeof sv) add({ path, class: "VALUE", kind });
  };
  walk(resultSchema.$defs.CalculationResultDTO, "", frontend, server);
  return diffs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Compares the non-finite path maps of both sides (mirrors contract.CompareNonFinite). */
export function compareNonFinite(frontend: Record<string, string>, server: Record<string, string>): FieldDiff[] {
  const keys = [...new Set([...Object.keys(frontend), ...Object.keys(server)])].sort();
  return keys.filter((k) => frontend[k] !== server[k]).map((path) => ({ path, class: "NON_FINITE" as const }));
}
