// Marine API Service - calls via Edge Function proxy to avoid CORS
import { dispatchSessionExpired, getStoredAuthToken } from "@/utils/authToken";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
  source_table?: string;
}

// Helper for API requests via Edge Function
export async function apiRequest<T>(
  endpoint: string,
  params?: Record<string, string | number>,
  options?: { method?: string; body?: unknown; authenticated?: boolean }
): Promise<T> {
  const queryParams = new URLSearchParams({ endpoint });
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        queryParams.append(key, String(value));
      }
    });
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Add JWT auth token for authenticated endpoints
  if (options?.authenticated !== false) {
    const token = getStoredAuthToken();
    if (!token) {
      dispatchSessionExpired();
      throw new Error("Session expired");
    }
    headers['X-Auth-Token'] = token;
  }

  const fetchOptions: RequestInit = {
    method: options?.method || 'GET',
    headers,
  };

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/marine-api?${queryParams.toString()}`,
    fetchOptions
  );

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
    const data = await apiRequest<{ types: VesselType[] }>("/vessel-types", undefined, { authenticated: false });
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
    const data = await apiRequest<{ vessels: MarineVessel[] }>("/vessels/search", params, { authenticated: false });
    return data.vessels || [];
  } catch (error) {
    console.error("Failed to search vessels:", error);
    return [];
  }
}

// 3. Search Ports
export async function searchPorts(query: string, limit: number = 10): Promise<MarinePort[]> {
  try {
    const data = await apiRequest<{ ports: MarinePort[] }>("/ports/search", { q: query }, { authenticated: false });
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
  destPortCode?: string
): Promise<SeaRouteResponse> {
  // Build the ports parameter: use port codes if available, otherwise lat,lon format
  const originPart = originPortCode ? originPortCode : `:${originLat},${originLon}`;
  const destPart = destPortCode ? destPortCode : `:${destLat},${destLon}`;
  const portsParam = `${originPart}_${destPart}`;

  const data = await apiRequest<{
    total_distance: number;
    eca_distance: number;
    non_eca_distance: number;
  }>("/fleetgo/distbl", { ports: portsParam }, { authenticated: true });

  return {
    total_distance_nm: data.total_distance ?? 0,
    eca_distance_nm: data.eca_distance ?? 0,
    non_eca_distance_nm: data.non_eca_distance ?? 0,
  };
}

// ============= Sheet Management APIs (Authenticated) =============

export interface SheetListItem {
  id: string;
  name: string;
  updated_at: string;
  created_at: string;
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
    const data = await apiRequest<SheetListResponse>("/sheets", { page, limit }, { authenticated: true });
    return data;
  } catch (error) {
    console.error("Failed to list sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

// 6. Save (create) a new sheet
export async function saveSheet(name: string, sheetData: Record<string, unknown>): Promise<SheetDetail | null> {
  try {
    const data = await apiRequest<{ sheet: SheetDetail }>("/sheets", undefined, {
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
    const data = await apiRequest<{ sheet: SheetDetail }>("/sheets", undefined, {
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
    const data = await apiRequest<{ sheet: SheetDetail }>(`/sheets/${id}`, undefined, { authenticated: true });
    return data.sheet || null;
  } catch (error) {
    console.error("Failed to get sheet:", error);
    return null;
  }
}

// 9. Delete a sheet by ID
export async function deleteSheet(id: string): Promise<boolean> {
  try {
    await apiRequest<{ message: string }>(`/sheets/${id}`, undefined, {
      method: 'DELETE',
      authenticated: true,
    });
    return true;
  } catch (error) {
    console.error("Failed to delete sheet:", error);
    return false;
  }
}
