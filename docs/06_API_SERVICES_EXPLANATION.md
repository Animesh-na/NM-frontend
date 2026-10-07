# API Services

---

## 1. Marine API Service

**File:** `src/services/marineApi.ts`  

### Purpose
Client for the Go API (NM-backend, `VITE_MARINE_API_BASE`) for vessel search, port search, sea route distances, sheets and workbooks.

### Architecture
```
Browser → /api/v1 (same origin, edge proxy) → Go API
          ↑ Authorization: Bearer <user JWT>; no API key in the browser
```

### Endpoints

| Function | External Endpoint | Returns |
|----------|------------------|---------|
| `getVesselTypes()` | `/vessel-types` | `VesselType[]` — vessel category list |
| `searchVessels(query)` | `/vessels/search?q=...` | `MarineVessel[]` — vessel particulars |
| `searchPorts(query)` | `/ports/search?q=...` | `MarinePort[]` — port name, code, coordinates |
| `getSeaRouteDistance(lat1, lon1, lat2, lon2)` | `/searoute` | `SeaRouteResponse` — total/ECA/non-ECA distances |

### `SeaRouteResponse`
```typescript
{
  total_distance_nm: number;    // Total sea route distance
  eca_distance_nm: number;      // Distance within ECA zones
  non_eca_distance_nm: number;  // Distance outside ECA zones
  eca_percentage: number;       // ECA as % of total
  route_geojson?: unknown;      // GeoJSON route geometry
}
```

---

## 2. Vessel Fuel API Service

**File:** `src/services/vesselFuelApi.ts`  

### Purpose
Searches vessels AND calculates fuel consumption from engine data (MCR + SFOC). Returns vessels with their consumption profiles.

### Key Function: `searchVesselsWithFuel(query, options)`

```typescript
const vessels = await searchVesselsWithFuel("Global Harmony", { mode: "eco" });
```

### `VesselWithFuel` Response
```typescript
{
  // Vessel particulars
  id, name, type, imo, dwt, gt, loa, beam, draught, builtyear, builder, owner,
  capacitycuft, scrubber_indicator, hsfo_allowed,
  
  // Engine data
  main_engine1_mcr: number,   // kW
  main_engine1_sfoc: number,  // g/kWh
  
  // Calculation result
  mode: "eco" | "full_speed",
  calculation_status: "ok" | "insufficient_engine_data",
  
  // Fuel consumption (null if insufficient_engine_data)
  fuel_consumption: {
    outside_eca: { fuel_type, me_tpd, ae_tpd, scrubber_penalty_tpd, tpd },
    inside_eca:  { fuel_type, me_tpd, ae_tpd, tpd },
    in_port:     { fuel_type, me_tpd, ae_tpd, tpd }
  }
}
```

### Two-Phase Fetch
When a vessel is selected:
1. **Eco fetch**: `searchVesselsWithFuel(imo, { mode: "eco" })` → eco consumption matrix
2. **Full speed fetch**: `searchVesselsWithFuel(imo, { mode: "full_speed" })` → full consumption matrix

Both matrices are stored in `VesselData.ecoConsumption` and `VesselData.fullConsumption`.

---

## 3. Local Sea Route Distance

**File:** `src/utils/seaRouteDistance.ts`

### Purpose
Client-side fallback for sea route distance using the `searoute-js` library. Used when the Marine API's `/searoute` endpoint is unavailable.

### Functions

#### `calculateSeaRouteDistance(origin, destination)`
Takes two `Port` objects with `[lon, lat]` coordinates, creates GeoJSON points, and uses `searoute-js` to compute the distance in nautical miles.

#### `calculateVoyageDistances(ports)`
Batch calculation for an entire voyage sequence — returns an array of distances for each consecutive port pair.

### Note
The Marine API `/searoute` endpoint also returns ECA distance breakdown, which the local library does not. The API version is preferred when available.
