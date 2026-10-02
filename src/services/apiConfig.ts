// Marine API (look-up-service) configuration. Browser calls authenticate with
// the user's JWT only: no API key is shipped to the browser (D-005). If the
// gateway in front of the API requires its API-Key header, the gateway adds it
// server-side.
// Browser calls require the upstream to send Access-Control-Allow-Origin for the
// app's deployed origins, otherwise every fetch will fail with a CORS error.
// VITE_MARINE_API_BASE points a local build at a local look-up-service
// (e.g. http://localhost:8080/api/v1); unset keeps the shared development API.
export const MARINE_API_BASE = import.meta.env.VITE_MARINE_API_BASE || "https://development.effimove.in/marine/api/v1";

export function buildMarineUrl(endpoint: string, params?: Record<string, string | number | undefined | null>): string {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const qs = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    });
  }
  const q = qs.toString();
  return `${MARINE_API_BASE}${path}${q ? `?${q}` : ""}`;
}

export function marineHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(extra || {}),
  };
}