// Upstream CORS smoke test.
//
// Probes the real Marine API at https://development.effimove.in/marine/api/v1
// to verify that every endpoint the frontend will call directly (once the
// Supabase edge proxy is removed) responds with a valid CORS preflight and
// an Access-Control-Allow-Origin header that permits this app's origins.
//
// Runs only when RUN_CORS_SMOKE=1 is set so it does not hit the network in
// normal unit-test runs / CI. To run:
//   RUN_CORS_SMOKE=1 bunx vitest run src/test/smoke/upstreamCors.test.ts
import { describe, it, expect } from "vitest";

const UPSTREAM = "https://development.effimove.in/marine/api/v1";

const ORIGINS = [
  "https://cozy-crafting-cloud.lovable.app",
  "https://id-preview--b1fa0047-513b-48aa-bb73-d934d8d54c3a.lovable.app",
  "http://localhost:5173",
];

// Endpoints actually used by src/services/*.ts. Method matches the real call.
const ENDPOINTS: Array<{ path: string; method: "GET" | "POST" | "PUT" | "DELETE" }> = [
  { path: "/vessel-types", method: "GET" },
  { path: "/vessels", method: "GET" },
  { path: "/ports/search", method: "GET" },
  { path: "/fleetgo/distbl", method: "GET" },
  { path: "/sheets", method: "GET" },
  { path: "/sheets", method: "POST" },
  { path: "/sheets/x", method: "GET" },
  { path: "/sheets/x", method: "DELETE" },
  { path: "/account/mfa", method: "GET" },
  { path: "/account/mfa/email/setup", method: "POST" },
  { path: "/account/mfa/email/confirm", method: "POST" },
  { path: "/account/mfa/totp/setup", method: "POST" },
  { path: "/account/mfa/totp/confirm", method: "POST" },
  { path: "/account/mfa/disable", method: "POST" },
  { path: "/admin/users", method: "GET" },
  { path: "/admin/users", method: "POST" },
  { path: "/admin/sheets", method: "GET" },
];

const SHOULD_RUN = process.env.RUN_CORS_SMOKE === "1";
const REQUIRED_HEADERS = "API-Key,Authorization,Content-Type,X-Auth-Token";

function originAllowed(acao: string | null, origin: string): boolean {
  if (!acao) return false;
  if (acao === "*") return true;
  return acao.toLowerCase() === origin.toLowerCase();
}

describe.skipIf(!SHOULD_RUN)("upstream CORS smoke", () => {
  for (const origin of ORIGINS) {
    describe(`origin ${origin}`, () => {
      for (const { path, method } of ENDPOINTS) {
        it(`${method} ${path} — preflight responds with permissive CORS`, async () => {
          const res = await fetch(`${UPSTREAM}${path}`, {
            method: "OPTIONS",
            headers: {
              Origin: origin,
              "Access-Control-Request-Method": method,
              "Access-Control-Request-Headers": REQUIRED_HEADERS,
            },
          });

          // Preflight MUST be a 2xx (typically 204). 4xx/5xx means the browser
          // will block the actual request.
          expect(
            res.status,
            `Preflight returned ${res.status} for ${method} ${path} from ${origin}`,
          ).toBeGreaterThanOrEqual(200);
          expect(res.status).toBeLessThan(300);

          const acao = res.headers.get("access-control-allow-origin");
          expect(
            originAllowed(acao, origin),
            `Missing/invalid Access-Control-Allow-Origin (got ${acao ?? "null"}) for ${method} ${path} from ${origin}`,
          ).toBe(true);

          const acam = (res.headers.get("access-control-allow-methods") || "").toUpperCase();
          expect(acam, `Missing Access-Control-Allow-Methods for ${path}`).toContain(method);

          const acah = (res.headers.get("access-control-allow-headers") || "").toLowerCase();
          for (const h of REQUIRED_HEADERS.split(",")) {
            expect(acah, `Missing ${h} in Access-Control-Allow-Headers for ${path}`).toContain(
              h.toLowerCase(),
            );
          }
        });

        it(`${method} ${path} — actual response carries Access-Control-Allow-Origin`, async () => {
          const res = await fetch(`${UPSTREAM}${path}`, {
            method,
            headers: { Origin: origin, "Content-Type": "application/json" },
            // Body content does not matter — we only inspect headers.
            body: method === "GET" || method === "DELETE" ? undefined : "{}",
          });

          const acao = res.headers.get("access-control-allow-origin");
          expect(
            originAllowed(acao, origin),
            `Actual ${method} ${path} from ${origin} missing/invalid ACAO (got ${acao ?? "null"})`,
          ).toBe(true);
        });
      }
    });
  }
});

describe.skipIf(SHOULD_RUN)("upstream CORS smoke (skipped)", () => {
  it("set RUN_CORS_SMOKE=1 to run live CORS probes against the Marine API", () => {
    expect(true).toBe(true);
  });
});