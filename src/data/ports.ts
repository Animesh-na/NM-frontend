// Port data from sea-ports npm package
// Structure: { unloc: { name, city, country, coordinates, ... } }
import portsJson from 'sea-ports';

export interface Port {
  unloc: string;
  name: string;
  city: string;
  country: string;
  coordinates?: [number, number];
  province?: string;
  timezone?: string;
}

// Convert the ports JSON to a searchable array
const portsData = portsJson.JSON as Record<string, {
  name: string;
  city?: string;
  country: string;
  coordinates?: [number, number];
  province?: string;
  timezone?: string;
}>;

export const ports: Port[] = Object.entries(portsData).map(([unloc, data]) => ({
  unloc,
  name: data.name,
  city: data.city || data.name,
  country: data.country,
  coordinates: data.coordinates,
  province: data.province,
  timezone: data.timezone,
}));

// Search ports by name, city, or unloc code
export function searchPorts(query: string, limit = 50): Port[] {
  if (!query || query.length < 2) return [];
  
  const lowerQuery = query.toLowerCase();
  
  return ports
    .filter(port => 
      port.name.toLowerCase().includes(lowerQuery) ||
      port.city.toLowerCase().includes(lowerQuery) ||
      port.unloc.toLowerCase().includes(lowerQuery) ||
      port.country.toLowerCase().includes(lowerQuery)
    )
    .slice(0, limit);
}

// Get port by UNLOC code
export function getPortByUnloc(unloc: string): Port | undefined {
  const data = portsData[unloc];
  if (!data) return undefined;
  
  return {
    unloc,
    name: data.name,
    city: data.city || data.name,
    country: data.country,
    coordinates: data.coordinates,
    province: data.province,
    timezone: data.timezone,
  };
}

// Get popular/common ports for initial display
export const popularPorts: Port[] = [
  { unloc: 'SGSIN', name: 'Singapore', city: 'Singapore', country: 'Singapore' },
  { unloc: 'CNSHA', name: 'Shanghai', city: 'Shanghai', country: 'China' },
  { unloc: 'AEDXB', name: 'Dubai', city: 'Dubai', country: 'United Arab Emirates' },
  { unloc: 'NLRTM', name: 'Rotterdam', city: 'Rotterdam', country: 'Netherlands' },
  { unloc: 'USHOU', name: 'Houston', city: 'Houston', country: 'United States' },
  { unloc: 'JPYOK', name: 'Yokohama', city: 'Yokohama', country: 'Japan' },
  { unloc: 'KRPUS', name: 'Busan', city: 'Busan', country: 'Korea, Republic of' },
  { unloc: 'INMUN', name: 'Mundra', city: 'Mundra', country: 'India' },
  { unloc: 'INPAV', name: 'Paradip', city: 'Paradip', country: 'India' },
  { unloc: 'VNSGN', name: 'Ho Chi Minh City', city: 'Ho Chi Minh City', country: 'Vietnam' },
];
