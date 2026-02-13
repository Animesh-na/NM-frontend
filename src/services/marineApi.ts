// Marine API Service - calls via Edge Function proxy to avoid CORS

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
  port_code: string;
  port_name: string;
  country: string;
  latitude: number;
  longitude: number;
}

// Helper for API requests via Edge Function
async function apiRequest<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
  const queryParams = new URLSearchParams({ endpoint });
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        queryParams.append(key, String(value));
      }
    });
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/marine-api?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// 1. Get Vessel Types
export async function getVesselTypes(): Promise<VesselType[]> {
  try {
    const data = await apiRequest<{ types: VesselType[] }>("/vessel-types");
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
    const data = await apiRequest<{ vessels: MarineVessel[] }>("/vessels/search", params);
    return data.vessels || [];
  } catch (error) {
    console.error("Failed to search vessels:", error);
    return [];
  }
}

// 3. Search Ports
export async function searchPorts(query: string, limit: number = 10): Promise<MarinePort[]> {
  try {
    const data = await apiRequest<{ ports: MarinePort[] }>("/ports/search", { q: query, limit });
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
  eca_percentage: number;
  route_geojson?: unknown;
}

export async function getSeaRouteDistance(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): Promise<SeaRouteResponse> {
  const data = await apiRequest<SeaRouteResponse>("/searoute", {
    origin_lat: originLat,
    origin_lon: originLon,
    dest_lat: destLat,
    dest_lon: destLon,
  });
  return data;
}
