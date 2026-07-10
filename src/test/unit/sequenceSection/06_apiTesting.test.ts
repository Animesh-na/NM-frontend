import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UNIT — API Testing (mocked upstream).
 *
 *   - Auto distance (FleetGo) happy path.
 *   - Fallback to lat/lon when port codes are rejected.
 *   - Weather-routing delayHours returned to caller.
 *   - System behaviour when the API errors, times out, or is unavailable.
 */

// Auth stub — getSeaRouteDistance requires a bearer token.
vi.mock("@/utils/authToken", () => ({
  getStoredAuthToken: () => "test-token",
  dispatchSessionExpired: vi.fn(),
}));

import { getSeaRouteDistance } from "@/services/marineApi";

const okJson = (body: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: () => Promise.resolve(body),
});

const errStatus = (status: number, statusText: string) => ({
  ok: false,
  status,
  statusText,
  json: () => Promise.resolve({}),
});

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("API — Auto distance (FleetGo)", () => {
  it("returns the mapped nm distances on a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okJson({ total_distance: 5500, eca_distance: 400, non_eca_distance: 5100 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSeaRouteDistance(-23.9, -46.3, 51.9, 4.4, "BRSSZ", "NLRTM");

    expect(result.total_distance_nm).toBe(5500);
    expect(result.eca_distance_nm).toBe(400);
    expect(result.non_eca_distance_nm).toBe(5100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to lat/lon when the port-code request is rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errStatus(400, "Bad Request"))
      .mockResolvedValueOnce(okJson({ total_distance: 1000, eca_distance: 0, non_eca_distance: 1000 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSeaRouteDistance(1, 1, 2, 2, "BRSSZ", "NLRTM");

    expect(result.total_distance_nm).toBe(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain(":1,1_:2,2");
  });

  it("passes vessel_speed + departure_utc through for weather routing and returns delayHours", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okJson({
        total_distance: 3000,
        eca_distance: 100,
        non_eca_distance: 2900,
        totalDelayHours: 12.5,
        ETA: ["2026-07-15 08:00"],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSeaRouteDistance(
      0,
      0,
      10,
      10,
      "BRSSZ",
      "NLRTM",
      12.5,
      "2026-07-10T08:00",
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("vessel_speed=12.5");
    expect(url).toContain("departure_utc=");
    expect(result.delayHours).toBe(12.5);
    expect(result.eta).toBe("2026-07-15 08:00");
  });
});

describe("API — Failure modes", () => {
  it("HTTP 500 upstream → getSeaRouteDistance rejects with a status error", async () => {
    // First (code-based) request fails and triggers the lat/lon fallback which also fails.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errStatus(500, "Internal Server Error")));
    await expect(getSeaRouteDistance(0, 0, 1, 1, "BRSSZ", "NLRTM")).rejects.toThrow(/500/);
  });

  it("Network timeout / unavailable → rejection is propagated to the caller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));
    await expect(getSeaRouteDistance(0, 0, 1, 1)).rejects.toThrow(/network timeout/);
  });

  it("Invalid payload (missing fields) → distances default to 0 without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(okJson({})));
    const result = await getSeaRouteDistance(0, 0, 1, 1);
    expect(result.total_distance_nm).toBe(0);
    expect(result.eca_distance_nm).toBe(0);
    expect(result.non_eca_distance_nm).toBe(0);
  });
});