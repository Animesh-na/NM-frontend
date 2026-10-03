import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetSaveConflict, updateSheet } from "@/services/marineApi";

// D-059: REST sheet saves are versioned — base_version is sent, and a newer
// version on the server is a typed conflict, never a silent overwrite.

afterEach(() => vi.restoreAllMocks());

function mockFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

function signedIn() {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=+$/, "");
  localStorage.setItem("voyagecalc_token", `h.${payload}.s`);
}

describe("versioned REST sheet saves", () => {
  it("sends base_version and returns the saved sheet with its new version", async () => {
    signedIn();
    const calls = mockFetch(200, { sheet: { id: "s1", name: "S", data: {}, version: 8 } });
    const saved = await updateSheet("s1", "S", { a: 1 }, null, 7);
    expect(calls[0].body).toMatchObject({ id: "s1", base_version: 7 });
    expect(saved?.version).toBe(8);
  });

  it("a 409 VERSION_CONFLICT is a typed conflict with the current version (no overwrite)", async () => {
    signedIn();
    mockFetch(409, { error: "VERSION_CONFLICT", current_version: 9, expected_version: 7 });
    await expect(updateSheet("s1", "S", {}, null, 7)).rejects.toMatchObject({ name: "SheetSaveConflict", code: "VERSION_CONFLICT", currentVersion: 9 });
  });

  it("a 409 LEASE_HELD (a live editing session) is a typed conflict too", async () => {
    signedIn();
    mockFetch(409, { error: "LEASE_HELD" });
    const err = await updateSheet("s1", "S", {}, null, 7).catch((e) => e);
    expect(err).toBeInstanceOf(SheetSaveConflict);
    expect(err.code).toBe("LEASE_HELD");
  });
});
