// Marine API Service - calls upstream Marine API DIRECTLY (no Supabase proxy).
// ⚠️ Requires upstream CORS allow-listing of every browser origin this app runs on.
import { dispatchSessionExpired, getStoredAuthToken } from "@/utils/authToken";
import { buildMarineUrl, marineHeaders } from "./apiConfig";
import { modePath } from "./apiMode";
import { logger } from "@/services/logger";

// Types
export interface VesselType {
  id: number;
  name: string;
}

export interface MarineVessel {
  id: number;
  name: string;
  type: string;
  imo: string;
  builtyear: number;
  builder: string;
  buildercountry: string;
  dwt: number;
  capacitycuft: number;
  owner: string;
  gt: number;
  loa: number;
  draught: number;
  beam: number;
  classificationsociety: string;
  companynationality: string;
}

export interface MarinePort {
  id: number;
  port_code?: string;
  port_name: string;
  country: string;
  latitude: number;
  longitude: number;
  is_eu_eea?: boolean;
  eca_zone?: boolean;
  /** Official EU ETS flag from port API. Preferred over is_eu_eea/country lookups. */
  eu_zone?: boolean;
  uk_ets?: boolean;
  uk_zone?: "gb" | "ni" | null;
  source_table?: string;
}

// Helper for direct API requests to the upstream Marine API
export async function apiRequest<T>(
  endpoint: string,
  params?: Record<string, string | number>,
  options?: { method?: string; body?: unknown; authenticated?: boolean }
): Promise<T> {
  const extraHeaders: Record<string, string> = {};

  if (options?.authenticated !== false) {
    const token = getStoredAuthToken();
    if (!token) {
      dispatchSessionExpired();
      throw new Error("Session expired");
    }
    extraHeaders["Authorization"] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = {
    method: options?.method || "GET",
    headers: marineHeaders(extraHeaders),
  };

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildMarineUrl(endpoint, params), fetchOptions);

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      dispatchSessionExpired();
    }
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// 1. Get Vessel Types
export async function getVesselTypes(): Promise<VesselType[]> {
  try {
    const data = await apiRequest<{ types: VesselType[] }>(modePath("/vessel-types"), undefined, { authenticated: true });
    return data.types || [];
  } catch (error) {
    console.error("Failed to fetch vessel types:", error);
    return [];
  }
}

// 2. Search Vessels
export async function searchVessels(
  query: string,
  typeId?: number,
  limit: number = 10
): Promise<MarineVessel[]> {
  try {
    const params: Record<string, string | number> = { q: query, limit };
    if (typeId) {
      params.type_id = typeId;
    }
    const data = await apiRequest<{ vessels: MarineVessel[] }>("/vessels", params, { authenticated: true });
    return data.vessels || [];
  } catch (error) {
    console.error("Failed to search vessels:", error);
    return [];
  }
}

// 3. Search Ports
export async function searchPorts(query: string, limit: number = 10): Promise<MarinePort[]> {
  try {
    const data = await apiRequest<{ ports: MarinePort[] }>("/ports/search", { q: query }, { authenticated: true });
    return data.ports || [];
  } catch (error) {
    console.error("Failed to search ports:", error);
    return [];
  }
}

// 4. Sea Route Distance Calculation
export interface SeaRouteResponse {
  total_distance_nm: number;
  eca_distance_nm: number;
  non_eca_distance_nm: number;
}

export async function getSeaRouteDistance(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  originPortCode?: string,
  destPortCode?: string,
  vesselSpeed?: number,
  departureUtc?: string
): Promise<SeaRouteResponse & { delayHours?: number; eta?: string }> {
  logger.info("Sea route distance requested", {
    component: "marineApi.getSeaRouteDistance",
    origin: originPortCode ?? `${originLat},${originLon}`,
    dest: destPortCode ?? `${destLat},${destLon}`,
    vessel_speed: vesselSpeed,
    weather_routing: !!(vesselSpeed && departureUtc),
  });
  // Build the ports parameter: use valid port codes if available, otherwise lat,lon format
  // Valid codes: from port search API, formatted as country+code (e.g. EGGUOS, EGSUZ, ZARCB)
  // Invalid: "NaN", empty, fallback "PORT-*"/"COORD-*", or legacy sea-ports short codes (<=4 chars)
  const isValidCode = (code?: string) =>
    !!code &&
    code !== "NaN" &&
    !code.startsWith("PORT-") &&
    !code.startsWith("COORD-") &&
    code.length >= 5; // Port search API codes are 5+ chars (country prefix + port)

  const bothValid = isValidCode(originPortCode) && isValidCode(destPortCode);

  const latLonOrigin = `:${originLat},${originLon}`;
  const latLonDest = `:${destLat},${destLon}`;

  // Build extra params for weather routing
  const extraParams: Record<string, string | number> = {};
  // API requires both vessel_speed AND departure_utc together — send neither if one is missing
  if (vesselSpeed && vesselSpeed > 0 && departureUtc) {
    extraParams.vessel_speed = vesselSpeed;
    // API expects "YYYY-MM-DD HH:mm" format; HTML datetime-local gives "YYYY-MM-DDTHH:mm"
    extraParams.departure_utc = departureUtc.replace("T", " ");
  }

  // Try port codes first if both look valid, fall back to lat/lon on failure
  if (bothValid) {
    try {
      const data = await apiRequest<{
        total_distance: number;
        eca_distance: number;
        non_eca_distance: number;
        delayHours?: number[];
        totalDelayHours?: number;
        ETA?: string[];
      }>("/fleetgo/distbl", { ports: `${originPortCode}_${destPortCode}`, ...extraParams }, { authenticated: true });
      return {
        total_distance_nm: data.total_distance ?? 0,
        eca_distance_nm: data.eca_distance ?? 0,
        non_eca_distance_nm: data.non_eca_distance ?? 0,
        delayHours: data.totalDelayHours ?? (data.delayHours?.[0] ?? undefined),
        eta: data.ETA?.[0] ?? undefined,
      };
    } catch {
      // Port codes rejected — fall through to lat/lon
      console.warn(`Port codes ${originPortCode}_${destPortCode} rejected, falling back to lat/lon`);
    }
  }

  // Use lat/lon format (always works)
  const data = await apiRequest<{
    total_distance: number;
    eca_distance: number;
    non_eca_distance: number;
    delayHours?: number[];
    totalDelayHours?: number;
    ETA?: string[];
  }>("/fleetgo/distbl", { ports: `${latLonOrigin}_${latLonDest}`, ...extraParams }, { authenticated: true });

  return {
    total_distance_nm: data.total_distance ?? 0,
    eca_distance_nm: data.eca_distance ?? 0,
    non_eca_distance_nm: data.non_eca_distance ?? 0,
    delayHours: data.totalDelayHours ?? (data.delayHours?.[0] ?? undefined),
    eta: data.ETA?.[0] ?? undefined,
  };
}

// ============= Sheet Management APIs (Authenticated) =============

export interface SheetListItem {
  id: string;
  name: string;
  updated_at: string;
  created_at: string;
  owner_email?: string;
}

export interface SheetListResponse {
  sheets: SheetListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface SheetDetail {
  id: string;
  name: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// 5. List all sheets with pagination
export async function listSheets(page: number = 1, limit: number = 10): Promise<SheetListResponse> {
  try {
    const data = await apiRequest<SheetListResponse>(modePath("/sheets"), { page, limit }, { authenticated: true });
    return data;
  } catch (error) {
    console.error("Failed to list sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

// 5b. List organization sheets (read-only view of other users' sheets in the org)
export async function listOrganizationSheets(page: number = 1, limit: number = 10): Promise<SheetListResponse> {
  try {
    const data = await apiRequest<SheetListResponse>(modePath("/organization/sheets"), { page, limit }, { authenticated: true });
    return data;
  } catch (error) {
    console.error("Failed to list organization sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

// 5c. List organization users
export interface OrganizationUser {
  id: string | number;
  email: string;
  name?: string;
  role?: string;
  sheet_count?: number;
  created_at?: string;
}

export interface OrganizationUsersResponse {
  users: OrganizationUser[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export async function listOrganizationUsers(page: number = 1, limit: number = 50): Promise<OrganizationUsersResponse> {
  try {
    const data = await apiRequest<OrganizationUsersResponse & { organization?: { users?: OrganizationUser[] } }>(
      modePath("/organization/users"),
      { page, limit },
      { authenticated: true }
    );
    const users = data.users || data.organization?.users || [];
    return { users, pagination: data.pagination };
  } catch (error) {
    console.error("Failed to list organization users:", error);
    return { users: [] };
  }
}

// 5d. List sheets owned by a specific organization user
export async function listUserSheets(userId: string | number, page: number = 1, limit: number = 50): Promise<SheetListResponse> {
  try {
    const data = await apiRequest<SheetListResponse>(modePath(`/organization/users/${userId}/sheets`), { page, limit }, { authenticated: true });
    return data;
  } catch (error) {
    console.error("Failed to list user sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

// 6. Save (create) a new sheet
export async function saveSheet(name: string, sheetData: Record<string, unknown>): Promise<SheetDetail | null> {
  try {
    const data = await apiRequest<{ sheet: SheetDetail }>(modePath("/sheets"), undefined, {
      method: 'POST',
      body: { name, data: sheetData },
      authenticated: true,
    });
    return data.sheet || null;
  } catch (error) {
    console.error("Failed to save sheet:", error);
    return null;
  }
}

// 7. Update an existing sheet
export async function updateSheet(id: string, name: string, sheetData: Record<string, unknown>): Promise<SheetDetail | null> {
  try {
    const data = await apiRequest<{ sheet: SheetDetail }>(modePath("/sheets"), undefined, {
      method: 'POST',
      body: { id, name, data: sheetData },
      authenticated: true,
    });
    return data.sheet || null;
  } catch (error) {
    console.error("Failed to update sheet:", error);
    return null;
  }
}

// 8. Get a single sheet by ID
export async function getSheet(id: string): Promise<SheetDetail | null> {
  try {
    const data = await apiRequest<{ sheet: SheetDetail }>(modePath(`/sheets/${id}`), undefined, { authenticated: true });
    return data.sheet || null;
  } catch (error) {
    console.error("Failed to get sheet:", error);
    return null;
  }
}

// 9. Delete a sheet by ID
export async function deleteSheet(id: string): Promise<boolean> {
  try {
    await apiRequest<{ message: string }>(modePath(`/sheets/${id}`), undefined, {
      method: 'DELETE',
      authenticated: true,
    });
    return true;
  } catch (error) {
    console.error("Failed to delete sheet:", error);
    return false;
  }
}

// 10. Search sheets by query
export async function searchSheets(query: string, page: number = 1, limit: number = 10): Promise<SheetListResponse> {
  try {
    return await apiRequest<SheetListResponse>(modePath("/sheets/search"), { q: query, page, limit }, { authenticated: true });
  } catch (error) {
    console.error("Failed to search sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}
