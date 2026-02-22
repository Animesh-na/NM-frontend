# Vessel Section – Data Population Reference

## Overview

The Vessel Section follows a three-layered workflow. This document describes how each field is populated and what fallback/default values are used when API data is unavailable.

---

## 1. Data Sources (Priority Order)

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | **Vessel Fuel API** | Live search by name/IMO via `vessel-fuel-api` edge function. Returns vessel particulars + fuel consumption (eco & full speed). |
| 2 | **DWT-Based Estimation** | When API returns `insufficient_engine_data` or no fuel data, consumption is estimated from DWT using `estimateExtendedConsumption()`. |
| 3 | **Manual Entry** | User clicks "+ Enter vessel manually" and fills all fields by hand. All values start at zero via `defaultVessel`. |

---

## 2. Vessel Particulars – Field Mapping

| Field | API Field | Fallback if Missing |
|-------|-----------|-------------------|
| Name | `v.name` | `""` (empty) |
| Type | `v.type` | `"Bulk Carrier"` |
| IMO | `v.imo` | `""` (empty) |
| DWT | `v.dwt` | `0` |
| GT | `v.gt` | `0` |
| Cubic Capacity | `v.capacitycuft` | `0` |
| Cubic Unit | — | `"cuft"` (from API), `"cbm"` (manual default) |
| Draft | `v.draught` | `0` |
| TPC/TPI | — | Estimated from DWT via `estimateTpc()` |
| HSFO Capability | `v.scrubber_indicator` | `false` |
| Has Scrubber | `v.scrubber_indicator` | `false` |
| Scrubber Count | `v.scrubber_indicator ? 1 : 0` | `0` |
| Built Year | `v.builtyear` | `undefined` |
| Builder | `v.builder` | `undefined` |
| Owner | `v.owner` | `undefined` |
| LOA | `v.loa` | `undefined` |
| Beam | `v.beam` | `undefined` |

---

## 3. TPC/TPI Estimation from DWT

When TPC is not available from the API, it is estimated using `estimateTpc(dwt)`:

| DWT Range | Estimated TPC |
|-----------|---------------|
| ≥ 200,000 | 95 |
| ≥ 100,000 | 80 |
| ≥ 60,000 | 68 |
| ≥ 40,000 | 58 |
| ≥ 25,000 | 50 |
| < 25,000 | 42 |

---

## 4. Speed & Consumption Matrix

### 4a. When API Fuel Data IS Available (`calculation_status === 'ok'`)

The API returns fuel consumption per zone. Mapping to the consumption matrix:

| Matrix Row | Outside ECA (Scrubber) | Outside ECA (No Scrubber) | Inside ECA | In Port |
|------------|----------------------|--------------------------|------------|---------|
| **HSFO** | ME TPD (ballast/laden/canal) | `0` | `0` | `0` |
| **VLSFO** | `0` | ME TPD (ballast/laden/canal) | `0` | `0` |
| **LSMGO** | `0` | `0` | ME TPD (ballast/laden/canal) | `0` (ME off in port) |
| **AE** | AE sea TPD | AE sea TPD | AE sea TPD | AE port TPD (load/disch/idle) |
| **AE Scrubber** | Scrubber penalty TPD | `0` | `0` | `0` |

**Two profiles are fetched:**
- **Eco** (ME Load 70%, AE Sea 3.5%, AE Port 6%, Scrubber Penalty 1.2%)
- **Full Speed** (ME Load 85%, AE Sea 4%, AE Port 6%, Scrubber Penalty 1.5%)

### 4b. When API Fuel Data IS NOT Available (DWT Estimation)

The function `estimateExtendedConsumption(dwt, isFull)` generates consumption based on vessel size category:

| DWT Range | Category | Eco Speed (kn) | HSFO Ballast/Laden (TPD) | VLSFO Ballast/Laden (TPD) | LSMGO Ballast/Laden (TPD) | AE Sea (TPD) | AE Scrubber Ballast/Laden (TPD) | AE Scrubber Canal (TPD) |
|-----------|----------|----------------|--------------------------|---------------------------|---------------------------|--------------|--------------------------------|------------------------|
| ≥ 200,000 | Capesize/Ore | 11.5 / 11.0 | 35 / 38 | 42 / 45 | 35 / 35 | 0.25 | 0.40 / 0.40 | 0.40 |
| ≥ 100,000 | Large Cape | 12.0 / 11.5 | 32 / 35 | 38 / 42 | 32 / 32 | 0.22 | 0.35 / 0.35 | 0.35 |
| ≥ 60,000 | Panamax | 12.5 / 12.0 | 28 / 30 | 34 / 36 | 28 / 28 | 0.20 | 0.32 / 0.32 | 0.32 |
| ≥ 40,000 | Supramax | 13.0 / 12.5 | 22 / 24 | 28 / 30 | 22 / 22 | 0.18 | 0.28 / 0.28 | 0.28 |
| ≥ 25,000 | Handysize | 13.5 / 13.0 | 18 / 20 | 22 / 24 | 18 / 18 | 0.15 | 0.25 / 0.25 | 0.25 |
| < 25,000 | Small | 14.0 / 13.5 | 14 / 16 | 18 / 20 | 14 / 14 | 0.12 | 0.20 / 0.20 | 0.20 |

**Full Speed adjustments:**
- Speed: × 1.15 (~15% faster)
- Fuel consumption: × 1.30 (~30% more)

**Port consumption estimates (from canal values):**
- Load / Discharge: canal × 1.2
- Idle: canal × 0.8
- AE Load/Discharge: AE canal × 1.5
- AE Idle: AE canal × 0.6
- **AE Scrubber Load/Discharge: AE Scrubber canal × 1.5**
- **AE Scrubber Idle: AE Scrubber canal × 0.6**

---

## 5. Default Vessel Template (`defaultVessel`)

When entering a vessel manually, all fields initialize to zero/empty:

```typescript
{
  name: "",
  type: "",
  imo: "",
  dwt: 0,
  gt: 0,
  cubic: 0,
  cubicUnit: "cbm",
  draft: 0,
  tpcTpi: 0,
  hsfoCapability: false,
  hasScrubber: false,
  scrubberCount: 0,
  speedProfile: "eco",
  loadDischIdleSame: false,
  miscMultiplier: 0,
  // All consumption matrices: all zeros
}
```

---

## 6. Data Flow Summary

```
User types vessel name/IMO
        │
        ▼
  searchVesselsWithFuel(query, mode='eco')
        │
        ├── API returns vessels with fuel_consumption ──► buildMatrixFromFuel() → ecoMatrix
        │                                                        │
        │   On selection: searchVesselsWithFuel(imo, mode='full_speed')
        │                         │
        │                         └── buildMatrixFromFuel() → fullMatrix
        │
        └── API returns insufficient_engine_data ──► estimateExtendedConsumption(dwt)
                                                            │
                                                    ├── eco (isFull=false)
                                                    └── full (isFull=true)
        │
        ▼
  vesselWithFuelToVesselData(vessel, fullSpeedFuel)
        │
        ▼
  VesselData object passed to onChange()
```

---

## 7. Scrubber Logic Impact on Fuel Selection

| Scrubber Equipped? | Outside ECA Fuel | Inside ECA Fuel | In Port Fuel |
|-------------------|-----------------|-----------------|--------------|
| **Yes** | HSFO (ME) + AE + Scrubber Penalty | LSMGO (ME + AE) | LSMGO (AE only) |
| **No** | VLSFO (ME) + AE | LSMGO (ME + AE) | LSMGO (AE only) |

> **Rule:** HSFO and VLSFO are never mixed. The scrubber flag determines which is used outside ECA.
