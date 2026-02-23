# Vessel Data Module

**File:** `src/data/vessels.ts` (335 lines)

---

## 1. Purpose

Defines vessel data types, the default vessel template, and DWT-based estimation functions used when API fuel data is unavailable.

---

## 2. Key Interfaces

### `VesselData` — The core vessel object
Contains everything about a vessel:
- **Particulars**: name, type, IMO, DWT, GT, cubic capacity, draft, TPC/TPI
- **Scrubber**: hsfoCapability, hasScrubber, scrubberCount
- **Metadata**: builtYear, builder, owner, LOA, beam
- **Speed profile**: `"eco"` or `"full"` — determines which matrix is active
- **Consumption matrices**: `ecoConsumption` and `fullConsumption` (type `ConsumptionMatrix`)
- **Legacy consumption**: Backward-compatible simplified format

### `ConsumptionMatrix`
A 6-row × 8-column matrix:
```
         Ballast | Laden | Canal | Load | Discharge | Idle | Misc1 | Misc2
Speed      ──────────────────────────────────────────────────────────────
HSFO       ──────────────────────────────────────────────────────────────
VLSFO      ──────────────────────────────────────────────────────────────
LSMGO      ──────────────────────────────────────────────────────────────
AE         ──────────────────────────────────────────────────────────────
AE Scrubber──────────────────────────────────────────────────────────────
```

### `ExtendedConsumption`
One row of the matrix — 8 values: ballast, laden, canal, load, discharge, idle, misc1, misc2.

---

## 3. DWT-Based Estimation

### `estimateExtendedConsumption(dwt, isFull)`

When the API returns `insufficient_engine_data`, consumption is estimated from DWT:

| DWT Range | Category | Eco Ballast Speed | Eco HSFO Ballast |
|-----------|----------|-------------------|-----------------|
| ≥ 200,000 | Capesize/Ore | 11.5 kn | 35 TPD |
| ≥ 100,000 | Large Cape | 12.0 kn | 32 TPD |
| ≥ 60,000 | Panamax | 12.5 kn | 28 TPD |
| ≥ 40,000 | Supramax | 13.0 kn | 22 TPD |
| ≥ 25,000 | Handysize | 13.5 kn | 18 TPD |
| < 25,000 | Small | 14.0 kn | 14 TPD |

**Full Speed adjustments:**
- Speed: × 1.15 (ballast/laden only)
- ME fuel: × 1.30 (ballast/laden only)
- Canal/Load/Discharge/Idle: **unchanged** between eco and full

**Port derivations from canal rates:**
- Load/Discharge = Canal × 1.2
- Idle = Canal × 0.8
- AE Load/Discharge = AE Canal × 1.5
- AE Idle = AE Canal × 0.6
- LSMGO port values = 0 (ME off in port; AE handles it)

### `estimateTpc(dwt)`
Rough TPC (Tonnes Per Centimetre) estimation:
| DWT | TPC |
|-----|-----|
| ≥200k | 95 |
| ≥100k | 80 |
| ≥60k | 68 |
| ≥40k | 58 |
| ≥25k | 50 |
| <25k | 42 |

### `syncLegacyConsumption(matrix)`
Converts extended matrix back to the legacy 3-column format (ecoBallast, ecoLaden, canal) for backward compatibility.

---

## 4. Data Flow: Three Sources

```
Priority 1: Vessel Fuel API (MCR/SFOC-based calculation)
    ↓ (if insufficient_engine_data)
Priority 2: DWT Estimation (estimateExtendedConsumption)
    ↓ (if manual entry)
Priority 3: Default Vessel (all zeros)
```

See `VESSEL_DATA_REFERENCE.md` for complete estimation tables.
