# Edge Functions

---

## 1. Marine API Proxy

**File:** `supabase/functions/marine-api/index.ts`

### Purpose
CORS proxy that forwards requests to the external Marine API, injecting the API key server-side so it's never exposed to the browser.

### How It Works
1. Browser sends request to edge function with `?endpoint=/vessels/search&q=...`
2. Edge function extracts the `endpoint` parameter
3. Forwards all other query params to `https://development.effimove.in/marine/api/v1{endpoint}?{params}`
4. Adds `API-Key: effimove@2026` header
5. Returns the JSON response with CORS headers

### Request Flow
```
GET /functions/v1/marine-api?endpoint=/vessels/search&q=Global&limit=10

→ GET https://development.effimove.in/marine/api/v1/vessels/search?q=Global&limit=10
  Headers: { API-Key: effimove@2026 }

← JSON response proxied back to browser
```

---

## 2. Vessel Fuel API

**File:** `supabase/functions/vessel-fuel-api/index.ts`

### Purpose
Vessel search with integrated fuel consumption calculation. When engine data (MCR + SFOC) is available, it computes daily fuel consumption rates for different zones and operating modes.

### Calculation Logic (Server-Side)

**Main Engine Fuel:**
```
ME_TPD = (MCR × ME_Load × SFOC × 24) / 1,000,000
```

**Auxiliary Engine Fuel:**
```
AE_TPD = (MCR × AE_Load × 181 × 24) / 1,000,000
```

**Operating Mode Constants:**

| Parameter | Full Speed | Eco |
|-----------|-----------|-----|
| ME Load | 85% | 70% |
| AE Sea | 4% | 3.5% |
| AE Port | 6% | 6% |
| Scrubber Penalty | 1.5% | 1.2% |

**Zone-Based Output:**
- **Outside ECA**: HSFO (if scrubber) or VLSFO + AE + scrubber penalty
- **Inside ECA**: LSMGO (ME + AE, no scrubber penalty)
- **In Port**: LSMGO (AE only, ME = 0)
