import searoute from 'searoute-js';
import type { Port } from '@/components/voyage/PortSelect';

interface GeoJSONPoint {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
}

interface SeaRouteResult {
  distance: number; // nautical miles
  success: boolean;
  error?: string;
}

/**
 * Calculate sea route distance between two ports using searoute-js
 * Returns distance in nautical miles
 */
export function calculateSeaRouteDistance(
  originPort: Port,
  destinationPort: Port
): SeaRouteResult {
  // Check if both ports have coordinates
  if (!originPort.coordinates || !destinationPort.coordinates) {
    return {
      distance: 0,
      success: false,
      error: 'Missing coordinates for one or both ports',
    };
  }

  try {
    // Create GeoJSON points - coordinates are [longitude, latitude]
    const origin: GeoJSONPoint = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: originPort.coordinates,
      },
    };

    const destination: GeoJSONPoint = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: destinationPort.coordinates,
      },
    };

    // Calculate route - returns distance in nautical miles by default
    const route = searoute(origin, destination, 'nm');

    if (!route) {
      return {
        distance: 0,
        success: false,
        error: 'No sea route found between ports',
      };
    }

    return {
      distance: Math.round(route.properties.length as number),
      success: true,
    };
  } catch (error) {
    console.error('Sea route calculation error:', error);
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
