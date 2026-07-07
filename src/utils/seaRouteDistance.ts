import type { Port } from '@/components/voyage/PortSelect';

interface SeaRouteResult {
  distance: number; // nautical miles
  success: boolean;
  error?: string;
}

// Earth radius in nautical miles
const EARTH_RADIUS_NM = 3440.065;

/**
 * Great-circle (haversine) distance between two [lon, lat] points in nautical miles.
 * Used as a client-side fallback when both the distance API and searoute-js fail.
 * Does not route around land — over-estimate by ~15% for open-ocean legs is typical.
 */
function haversineNm(
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number],
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

/**
 * Fallback sea route distance between two ports.
 * Uses great-circle (haversine) — approximate, but reliable in the browser
 * (searoute-js has a bundler-incompatibility with its js-priority-queue dep).
 * Returns distance in nautical miles, rounded.
 */
export function calculateSeaRouteDistance(
  originPort: Port,
  destinationPort: Port
): SeaRouteResult {
  if (!originPort.coordinates || !destinationPort.coordinates) {
    return {
      distance: 0,
      success: false,
      error: 'Missing coordinates for one or both ports',
    };
  }

  try {
    const nm = haversineNm(originPort.coordinates, destinationPort.coordinates);
    if (!Number.isFinite(nm) || nm <= 0) {
      return { distance: 0, success: false, error: 'Invalid great-circle distance' };
    }
    return { distance: Math.round(nm), success: true };
  } catch (error) {
    console.error('Great-circle distance calculation error:', error);
    return {
      distance: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Calculate distances for an entire voyage sequence
 * Returns array of distances for each leg
 */
export function calculateVoyageDistances(
  ports: (Port | null)[]
): SeaRouteResult[] {
  const results: SeaRouteResult[] = [];
  
  for (let i = 0; i < ports.length; i++) {
    if (i === 0) {
      // First port has no previous leg
      results.push({ distance: 0, success: true });
      continue;
    }

    const prevPort = ports[i - 1];
    const currPort = ports[i];

    if (!prevPort || !currPort) {
      results.push({ distance: 0, success: false, error: 'Missing port' });
      continue;
    }

    results.push(calculateSeaRouteDistance(prevPort, currPort));
  }

  return results;
}
