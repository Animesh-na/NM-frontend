// Marine API Service
// Base URL and API Key for Effimove Marine APIs

const BASE_URL = "https://development.effimove.in/marine/api/v1";
const API_KEY = "effimove@2026";

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

// Helper for API requests
async function apiRequest<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "API-Key": API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// 1. Get Vessel Types
export async function getVesselTypes(): Promise<VesselType[]> {
  const data = await apiRequest<{ types: VesselType[] }>("/vessel-types");
  return data.types || [];
}

// 2. Search Vessels
export async function searchVessels(
  query: string,
  typeId?: number,
  limit: number = 10
): Promise<MarineVessel[]> {
  const params: Record<string, string | number> = { q: query, limit };
  if (typeId) {
    params.type_id = typeId;
  }
  const data = await apiRequest<{ vessels: MarineVessel[] }>("/vessels/search", params);
  return data.vessels || [];
}

// 3. Search Ports
export async function searchPorts(query: string, limit: number = 10): Promise<MarinePort[]> {
  const data = await apiRequest<{ ports: MarinePort[] }>("/ports/search", { q: query, limit });
  return data.ports || [];
}
