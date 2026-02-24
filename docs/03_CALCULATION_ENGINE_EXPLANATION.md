# Calculation Engine — useVoyageCalculation

**File:** `src/hooks/useVoyageCalculation.ts` (594 lines)

---

## 1. Purpose

This is the **core mathematical engine** of the application. It's a pure function wrapped in `useMemo` — given inputs, it deterministically produces all voyage results. No side effects, no API calls, no state mutations.

```typescript
export function useVoyageCalculation(inputs: VoyageInputs): VoyageResults {
  return useMemo(() => { /* all calculations */ }, [inputs]);
}
```

---

## 2. Input Types

### VoyageInputs
| Field | Type | Description |
|-------|------|-------------|
| `vessel` | `VesselData` | Vessel particulars + consumption matrices |
| `sequence` | `SequenceRow[]` | Voyage legs with distances, port days, sea times |
| `cargo` | `CargoData` | Freight rate, quantity, commissions, dem/desp |
| `bunker` | `BunkerData` | Fuel prices, ROB, CO₂ price, reward factor |
| `hireRate` | `number` | Daily hire rate ($/day) |
| `misc` | `MiscCostsData` | Misc/canal costs |
| `extraTime` | `ExtraTimeData` | Additional canal/port/sea time |

---

## 3. Calculation Pipeline (10 Steps)

### Step 1: Distance & Time Accumulation (Lines 166–245)

Iterates through the sequence to accumulate:
- **Distances**: total, ECA, ballast, laden
- **Sea times**: Uses pre-calculated `seaTime` from VoyageContext (already includes sea margin)
- **Port operation tracking**: Splits port time into working days vs idle days

**Ballast/Laden logic:**
```
Ship starts in BALLAST
→ Sails TO loading port (BALLAST sea time)
→ At loading port: loadingDays (working) + turnTime (idle)
→ isLaden = true
→ Sails TO discharge port (LADEN sea time)
→ At discharge port: dischargingDays (working) + turnTime (idle)
→ isLaden = false
```

**Port time split:**
```
turnExtraDays = (turnTimeHours + extraTimeHours) / 24
workingDays = max(0, portDays - turnExtraDays)
```
- Working days → use Load/Discharge fuel rates
- Turn + Extra time → use Idle fuel rates

### Step 2: Extra Time (Lines 248–251)

Adds misc section extra time:
```
extraSeaDays = extraTime.atSeaDays
extraPortDays = extraTime.idlePortDays
extraCanalDays = canal1Days + canal2Days
```

### Step 3: Total Voyage Duration (Lines 253–256)

```
totalSeaDays = seaDaysBallast + seaDaysLaden + extraSeaDays
totalVoyageDays = totalSeaDays + totalPortDays + extraPortDays + extraCanalDays
```

### Step 4: Bunker Consumption — AXS Marine Model (Lines 258–371)

This is the most complex section. It calculates fuel consumption by zone and operation type.

**Profile selection:**
```typescript
const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
const rewardFactor = bunker?.rewardFactor ?? 1.0;
```

#### 4a. Non-ECA Sea Consumption
Each fuel type (HSFO, VLSFO) burned at its normal rate. **LSMGO is NOT used outside ECA**:
```
[HSFO/VLSFO]_Sea = (NonECA_Ballast_Days × Ballast_Rate 
           + NonECA_Laden_Days × Laden_Rate 
           + Extra_Sea_Days × Laden_Rate) × Reward_Factor
LSMGO_NonECA = 0
```

#### 4b. ECA Sea Consumption
In ECA zones, **HSFO = 0, VLSFO = 0**. All fuel shifts to LSMGO at combined rate:
```
ECA_Ballast_Rate = HSFO_Ballast + VLSFO_Ballast + LSMGO_Ballast
ECA_Laden_Rate = HSFO_Laden + VLSFO_Laden + LSMGO_Laden

LSMGO_ECA = (ECA_Ballast_Days × ECA_Ballast_Rate + ECA_Laden_Days × ECA_Laden_Rate) × Reward_Factor
```
ECA distance is split separately into Laden and Ballast portions, then converted to ECA sailing days using the respective speeds.

#### 4c. Port Consumption (by operation)
**LSMGO is NOT used in port** (outside ECA):
```
Loading:     [HSFO/VLSFO]_Load_Rate × loadingDays
Discharging: [HSFO/VLSFO]_Discharge_Rate × dischargingDays
Idle:        [HSFO/VLSFO]_Idle_Rate × (idleDays + bunkeringDays + extraPortDays)
Canal:       [HSFO/VLSFO]_Canal_Rate × (canalDays + extraCanalDays)
```

#### 4d. AE (Auxiliary Engine) Consumption
AE always runs on LSMGO across **all operations except canal**:
```
AE_Sea = (Total_Ballast_Days × AE_Ballast + Total_Laden_Days × AE_Laden + Extra_Sea_Days × AE_Laden) × Reward_Factor
AE_Port = Loading_Days × AE_Load + Discharging_Days × AE_Discharge + Idle_Days × AE_Idle
AE_Canal = 0  (AE not counted during canal transit)
LSMGO_AE_Total = AE_Sea + AE_Port
```

#### 4e. Totals
```
HSFO_Total = HSFO_Sea + HSFO_Loading + HSFO_Discharging + HSFO_Idle + HSFO_Canal
VLSFO_Total = VLSFO_Sea + VLSFO_Loading + VLSFO_Discharging + VLSFO_Idle + VLSFO_Canal
LSMGO_Total = LSMGO_ECA + LSMGO_AE_Total   (ECA zones only)
```

### Step 5: Bunker Cost (Lines 373–386)

```
Total_Bunker_Cost = HSFO_Total × HSFO_Price + VLSFO_Total × VLSFO_Price + LSMGO_Total × LSMGO_Price
```

### Step 6: Freight & Revenue (Lines 388–397)

```
Gross_Freight = rate × quantity   (or lumpsum)
Voyage_Commission = Gross_Freight × voyageCommission%
Net_Freight = Gross_Freight - Voyage_Commission
```

### Step 7: Misc Costs (Lines 399–401)

```
miscCosts = miscCost + extraFees + extraInsurance
canalCosts = canalCost1 + canalCost2
```

### Step 8: Total Voyage Costs (Lines 403–414)

```
Total_Voyage_Costs = Bunker + Port + Misc + Canal   (NO commissions)
Hire_Cost = Hire_Rate × Total_Voyage_Days
```

### Step 9: Profitability (Lines 416–436)

```
Voyage_Result = Net_Freight - Total_Voyage_Costs + Demurrage - Despatch
P&L = Voyage_Result - Hire_Cost

NTCE = (Net_Freight - Total_Voyage_Costs) / Total_Voyage_Days
GTCE = NTCE / (1 - TC_Commission_Rate)
TCE = GTCE   (used interchangeably)
```

### Step 10: Environmental Metrics (Lines 438–571)

Uses `emissionCalculations.ts` module:

1. **CO₂ by fuel**: `fuel_consumption × emission_factor`
2. **CO₂ split**: Proportional to ballast/laden sea time
3. **EFOI**: `(Total_CO₂ × 10⁶) / (Cargo × Laden_Distance)`
4. **EU ETS**: Per-leg coverage (EU→EU=100%, EU→NonEU=50%) × phase-in%
5. **CII Rating**: `(Total_CO₂ × 10⁶) / (DWT × Distance)` vs IMO reference

---

## 4. Output: VoyageResults

The hook returns ~50 calculated fields grouped into:

| Group | Key Fields |
|-------|-----------|
| **Time** | totalDistance, totalSeaDays, totalPortDays, totalVoyageDays, baseSeaTime, seaMarginTime |
| **Fuel** | hsfoConsumption, vlsfoConsumption, lsmgoConsumption, totalBunkerCost |
| **ECA Breakdown** | nonEcaFuel, ecaFuel, nonEcaCo2, ecaCo2 |
| **Revenue** | grossFreight, voyageCommission, netFreight |
| **Costs** | portCosts, miscCosts, canalCosts, totalVoyageCosts, hireCost |
| **Profitability** | tce, ntce, gtce, pAndL, grossProfit |
| **Emissions** | totalCo2, co2ByFuel, efoi, afrCii, ciiRating, ciiResult |
| **EU ETS** | etsResult, etsCost, chargeableCo2, etsVoyageCoverage, etsPhaseIn |
| **Validation** | emissionWarnings, emissionErrors |
