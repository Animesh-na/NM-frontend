# Emission Calculations Module

**File:** `src/utils/emissionCalculations.ts` (417 lines)

---

## 1. Purpose

Pure utility module containing all environmental/emission formulas: CO₂ calculations, IMO CII rating, EFOI indicator, and EU ETS cost compliance.

---

## 2. CO₂ Emission Factors

```typescript
export const CO2_EMISSION_FACTORS = {
  hsfo:  3.114,  // t CO₂ per t fuel (Heavy Fuel Oil)
  vlsfo: 3.114,  // t CO₂ per t fuel (Very Low Sulphur Fuel Oil)
  lsmgo: 3.206,  // t CO₂ per t fuel (Low Sulphur Marine Gas Oil)
};
```

### `calculateCo2Emissions(fuel)`
Multiplies each fuel type's consumption by its emission factor:
```
CO₂_total = (HSFO × 3.114) + (VLSFO × 3.114) + (LSMGO × 3.206)
```

---

## 3. EU ETS (Emissions Trading System)

### 3.1 Voyage Coverage

Coverage depends on whether origin/destination ports are in the EU/EEA:

| Route | Coverage |
|-------|---------|
| EU → EU | 100% |
| EU → Non-EU | 50% |
| Non-EU → EU | 50% |
| Non-EU → Non-EU | 0% |

**EU determination:** First 2 characters of UNLOC code checked against `EU_COUNTRIES` set (27 EU + 3 EEA countries).

### 3.2 Phase-In Schedule

| Year | Phase-In |
|------|---------|
| 2024 | 40% |
| 2025 | 70% |
| 2026+ | 100% |

### 3.3 ETS Cost Calculation

```typescript
function calculateEtsCost(input: EtsCalculationInput): EtsResult
```

For each voyage leg:
```
Chargeable_CO₂ = Leg_CO₂ × Coverage_% × Phase_In_%
```

Total:
```
ETS_Cost = Σ(Chargeable_CO₂) × CO₂_Price ($/t)
```

Returns detailed breakdown per leg including coverage type and chargeable amount.

---

## 4. CII Rating (Carbon Intensity Indicator)

### 4.1 IMO Methodology

```typescript
function calculateCiiRating(input: CiiCalculationInput): CiiResult
```

**Actual CII:**
```
Actual_CII (gCO₂/dwt·nm) = (Total_CO₂ × 10⁶) / (DWT × Distance)
```

**Required CII (Reference):**
```
Required_CII = a × DWT^(-c) × (1 - Reduction_Factor)
```

| Ship Type | a | c |
|-----------|---|---|
| Bulk Carrier | 4,745 | 0.622 |
| Tanker | 5,247 | 0.610 |
| Container | 1,984 | 0.489 |
| General Cargo | 588 | 0.3885 |

**Reduction factors:** 2023: 5%, 2024: 7%, 2025: 9%, 2026: 11%

### 4.2 Rating Boundaries

```
CII_Ratio = Actual_CII / Required_CII
```

| Rating | Ratio Range | Meaning |
|--------|------------|---------|
| **A** | ≤ 0.82 | Superior — significantly exceeds requirements |
| **B** | 0.82 – 0.93 | Minor superior |
| **C** | 0.93 – 1.08 | Moderate — meets requirements |
| **D** | 1.08 – 1.20 | Inferior — corrective action advised |
| **E** | > 1.20 | Inferior — significant action required |

---

## 5. EFOI (Energy Efficiency Operational Indicator)

```typescript
function calculateEfoi(totalCo2, cargoCarried, ladenDistance): EfoiResult
```

```
EFOI (gCO₂/t·nm) = (Total_CO₂ × 10⁶) / (Cargo_Carried × Laden_Distance)
```

Measures CO₂ efficiency per unit of cargo transported. Lower is better.

---

## 6. Validation

```typescript
function validateEmissionInputs(fuel, dwt, distance, cargo, co2Price): EmissionValidationResult
```

Checks:
- **Errors**: No fuel data, missing DWT, missing distance
- **Warnings**: Missing cargo (EFOI unavailable), CO₂ price not set (ETS = $0)
