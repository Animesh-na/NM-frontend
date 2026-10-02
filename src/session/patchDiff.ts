/**
 * Turns document changes into allowlisted sheet patches (M7).
 *
 * diffDocuments compares the last document the server has accepted with the
 * current one and returns JSON-Pointer operations: objects are diffed per key,
 * arrays per element when their length is unchanged and as one `set` of the
 * whole array otherwise (the server applies a patch atomically, so this is
 * always consistent). Operations that fail client-side validation are held
 * back (returned separately) and are retried on the next change.
 */
import { MAX_OPS_PER_PATCH, pointer, validateOp, type PatchOp } from "./patchAllowlist";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isObject(v: unknown): v is Record<string, Json> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => jsonEqual(a[k], b[k]));
  }
  return false;
}

export function diffDocuments(prev: unknown, next: unknown): PatchOp[] {
  const ops: PatchOp[] = [];
  const walk = (a: unknown, b: unknown, path: (string | number)[]) => {
    if (jsonEqual(a, b)) return;
    if (isObject(a) && isObject(b)) {
      for (const k of Object.keys(a)) {
        if (a[k] !== undefined && (b[k] === undefined || !(k in b))) ops.push({ op: "remove", path: pointer([...path, k]) });
      }
      for (const k of Object.keys(b)) {
        if (b[k] === undefined) continue;
        walk(a[k], b[k], [...path, k]);
      }
      return;
    }
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && path.length > 0) {
      b.forEach((x, i) => walk(a[i], x, [...path, i]));
      return;
    }
    if (path.length === 0) {
      // Root replaced by a non-object: not representable; diff against {}.
      if (isObject(b)) walk({}, b, path);
      return;
    }
    ops.push({ op: "set", path: pointer(path), value: b });
  };
  walk(prev, next, []);
  return ops;
}

/** Applies operations to a copy of the document (the client's model of the server). */
export function applyOps(doc: unknown, ops: PatchOp[]): unknown {
  const root = JSON.parse(JSON.stringify(doc ?? {}));
  for (const op of ops) {
    const segs = op.path.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    let cur: Record<string, unknown> | unknown[] = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      const holder = cur as Record<string, unknown>;
      if (holder[s] === undefined || holder[s] === null) holder[s] = /^\d+$/.test(segs[i + 1]) ? [] : {};
      cur = holder[s] as Record<string, unknown>;
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) {
      const idx = last === "-" ? cur.length : Number(last);
      if (op.op === "remove") cur.splice(idx, 1);
      else cur[idx] = op.value;
    } else if (op.op === "remove") {
      delete (cur as Record<string, unknown>)[last];
    } else {
      (cur as Record<string, unknown>)[last] = op.value;
    }
  }
  return root;
}

export interface PatchPlan {
  ops: PatchOp[];      // valid operations to send (one patch)
  held: PatchOp[];     // invalid for now (e.g. incomplete input)
  overflow: boolean;   // more valid ops than one patch may carry: send the rest next
}

/** Diffs and validates; the valid ops fit one patch (the rest follows next time). */
export function planPatch(serverDoc: unknown, localDoc: unknown): PatchPlan {
  const all = diffDocuments(serverDoc, localDoc);
  const ops: PatchOp[] = [];
  const held: PatchOp[] = [];
  for (const op of all) (validateOp(op) === null ? ops : held).push(op);
  return { ops: ops.slice(0, MAX_OPS_PER_PATCH), held, overflow: ops.length > MAX_OPS_PER_PATCH };
}
