# Vessel Section – Data Population Reference

## Overview

The Vessel Section follows a three-layered workflow. This document describes how each field is populated and what fallback/default values are used when API data is unavailable.

---

## 1. Data Sources (Priority Order)

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | **Vessel Fuel API** | Live search by name/IMO via the Go API's vessel search (`src/services/vesselFuelApi.ts`). Returns vessel particulars + fuel consumption (eco & full speed). |
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

The function `estimateExtendedConsumption(dwt, isFull)` generates consumption based on vessel size category.

**Key rules:**
- Full Speed: Ballast/Laden speed × 1.15, Ballast/Laden ME fuel × 1.30
- Canal, Load, Discharge, Idle values are **identical** for both Eco and Full Speed (no multiplier applied)
- Port derivation from canal: Load/Discharge = canal × 1.2, Idle = canal × 0.8
- AE port derivation: Load/Discharge = AE canal × 1.5, Idle = AE canal × 0.6
- AE Scrubber port derivation: Load/Discharge = AE Scrubber canal × 1.5, Idle = AE Scrubber canal × 0.6
- LSMGO port values = 0 (ME off in port; AE handles port consumption)

---

### Eco Speed — Complete Matrix

#### ≥ 200,000 DWT (Capesize / Ore Carrier)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 11.5 | 11.0 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 35 | 38 | 6 | 7.2 | 7.2 | 4.8 |
| **VLSFO (TPD)** | 42 | 45 | 6 | 7.2 | 7.2 | 4.8 |
| **LSMGO (TPD)** | 35 | 35 | 6 | 0 | 0 | 0 |
| **AE (TPD)** | 0.25 | 0.25 | 0.40 | 0.60 | 0.60 | 0.24 |
| **AE Scrubber (TPD)** | 0.40 | 0.40 | 0.40 | 0.60 | 0.60 | 0.24 |

#### ≥ 100,000 DWT (Large Capesize)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 12.0 | 11.5 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 32 | 35 | 5 | 6.0 | 6.0 | 4.0 |
| **VLSFO (TPD)** | 38 | 42 | 5 | 6.0 | 6.0 | 4.0 |
| **LSMGO (TPD)** | 32 | 32 | 5 | 0 | 0 | 0 |
| **AE (TPD)** | 0.22 | 0.22 | 0.35 | 0.525 | 0.525 | 0.21 |
| **AE Scrubber (TPD)** | 0.35 | 0.35 | 0.35 | 0.525 | 0.525 | 0.21 |

#### ≥ 60,000 DWT (Panamax)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 12.5 | 12.0 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 28 | 30 | 4.5 | 5.4 | 5.4 | 3.6 |
| **VLSFO (TPD)** | 34 | 36 | 4.5 | 5.4 | 5.4 | 3.6 |
| **LSMGO (TPD)** | 28 | 28 | 4.5 | 0 | 0 | 0 |
| **AE (TPD)** | 0.20 | 0.20 | 0.32 | 0.48 | 0.48 | 0.192 |
| **AE Scrubber (TPD)** | 0.32 | 0.32 | 0.32 | 0.48 | 0.48 | 0.192 |

#### ≥ 40,000 DWT (Supramax)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 13.0 | 12.5 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 22 | 24 | 3.5 | 4.2 | 4.2 | 2.8 |
| **VLSFO (TPD)** | 28 | 30 | 3.5 | 4.2 | 4.2 | 2.8 |
| **LSMGO (TPD)** | 22 | 22 | 3.5 | 0 | 0 | 0 |
| **AE (TPD)** | 0.18 | 0.18 | 0.28 | 0.42 | 0.42 | 0.168 |
| **AE Scrubber (TPD)** | 0.28 | 0.28 | 0.28 | 0.42 | 0.42 | 0.168 |

#### ≥ 25,000 DWT (Handysize)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 13.5 | 13.0 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 18 | 20 | 3 | 3.6 | 3.6 | 2.4 |
| **VLSFO (TPD)** | 22 | 24 | 3 | 3.6 | 3.6 | 2.4 |
| **LSMGO (TPD)** | 18 | 18 | 3 | 0 | 0 | 0 |
| **AE (TPD)** | 0.15 | 0.15 | 0.25 | 0.375 | 0.375 | 0.15 |
| **AE Scrubber (TPD)** | 0.25 | 0.25 | 0.25 | 0.375 | 0.375 | 0.15 |

#### < 25,000 DWT (Small)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 14.0 | 13.5 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 14 | 16 | 2.5 | 3.0 | 3.0 | 2.0 |
| **VLSFO (TPD)** | 18 | 20 | 2.5 | 3.0 | 3.0 | 2.0 |
| **LSMGO (TPD)** | 14 | 14 | 2.5 | 0 | 0 | 0 |
| **AE (TPD)** | 0.12 | 0.12 | 0.20 | 0.30 | 0.30 | 0.12 |
| **AE Scrubber (TPD)** | 0.20 | 0.20 | 0.20 | 0.30 | 0.30 | 0.12 |

---

### Full Speed — Complete Matrix

> Only **Speed** (× 1.15) and **Ballast/Laden ME fuel** (× 1.30) change. Canal, Load, Discharge, Idle, AE, and AE Scrubber remain identical to Eco.

#### ≥ 200,000 DWT (Capesize / Ore Carrier)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 13.225 | 12.65 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 45.5 | 49.4 | 6 | 7.2 | 7.2 | 4.8 |
| **VLSFO (TPD)** | 54.6 | 58.5 | 6 | 7.2 | 7.2 | 4.8 |
| **LSMGO (TPD)** | 45.5 | 45.5 | 6 | 0 | 0 | 0 |
| **AE (TPD)** | 0.25 | 0.25 | 0.40 | 0.60 | 0.60 | 0.24 |
| **AE Scrubber (TPD)** | 0.40 | 0.40 | 0.40 | 0.60 | 0.60 | 0.24 |

#### ≥ 100,000 DWT (Large Capesize)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 13.8 | 13.225 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 41.6 | 45.5 | 5 | 6.0 | 6.0 | 4.0 |
| **VLSFO (TPD)** | 49.4 | 54.6 | 5 | 6.0 | 6.0 | 4.0 |
| **LSMGO (TPD)** | 41.6 | 41.6 | 5 | 0 | 0 | 0 |
| **AE (TPD)** | 0.22 | 0.22 | 0.35 | 0.525 | 0.525 | 0.21 |
| **AE Scrubber (TPD)** | 0.35 | 0.35 | 0.35 | 0.525 | 0.525 | 0.21 |

#### ≥ 60,000 DWT (Panamax)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 14.375 | 13.8 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 36.4 | 39.0 | 4.5 | 5.4 | 5.4 | 3.6 |
| **VLSFO (TPD)** | 44.2 | 46.8 | 4.5 | 5.4 | 5.4 | 3.6 |
| **LSMGO (TPD)** | 36.4 | 36.4 | 4.5 | 0 | 0 | 0 |
| **AE (TPD)** | 0.20 | 0.20 | 0.32 | 0.48 | 0.48 | 0.192 |
| **AE Scrubber (TPD)** | 0.32 | 0.32 | 0.32 | 0.48 | 0.48 | 0.192 |

#### ≥ 40,000 DWT (Supramax)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 14.95 | 14.375 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 28.6 | 31.2 | 3.5 | 4.2 | 4.2 | 2.8 |
| **VLSFO (TPD)** | 36.4 | 39.0 | 3.5 | 4.2 | 4.2 | 2.8 |
| **LSMGO (TPD)** | 28.6 | 28.6 | 3.5 | 0 | 0 | 0 |
| **AE (TPD)** | 0.18 | 0.18 | 0.28 | 0.42 | 0.42 | 0.168 |
| **AE Scrubber (TPD)** | 0.28 | 0.28 | 0.28 | 0.42 | 0.42 | 0.168 |

#### ≥ 25,000 DWT (Handysize)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 15.525 | 14.95 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 23.4 | 26.0 | 3 | 3.6 | 3.6 | 2.4 |
| **VLSFO (TPD)** | 28.6 | 31.2 | 3 | 3.6 | 3.6 | 2.4 |
| **LSMGO (TPD)** | 23.4 | 23.4 | 3 | 0 | 0 | 0 |
| **AE (TPD)** | 0.15 | 0.15 | 0.25 | 0.375 | 0.375 | 0.15 |
| **AE Scrubber (TPD)** | 0.25 | 0.25 | 0.25 | 0.375 | 0.375 | 0.15 |

#### < 25,000 DWT (Small)

| Row | Ballast | Laden | Canal | Load | Discharge | Idle |
|-----|---------|-------|-------|------|-----------|------|
| **Speed (kn)** | 16.1 | 15.525 | 0 | 0 | 0 | 0 |
| **HSFO (TPD)** | 18.2 | 20.8 | 2.5 | 3.0 | 3.0 | 2.0 |
| **VLSFO (TPD)** | 23.4 | 26.0 | 2.5 | 3.0 | 3.0 | 2.0 |
| **LSMGO (TPD)** | 18.2 | 18.2 | 2.5 | 0 | 0 | 0 |
| **AE (TPD)** | 0.12 | 0.12 | 0.20 | 0.30 | 0.30 | 0.12 |
| **AE Scrubber (TPD)** | 0.20 | 0.20 | 0.20 | 0.30 | 0.30 | 0.12 |

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
