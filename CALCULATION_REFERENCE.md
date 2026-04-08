# Voyage Calculation Reference — Full Mathematical Breakdown

> **Scope:** From vessel search → fuel consumption API → voyage time → bunker consumption → bunker cost → freight → profitability → emissions → regulatory costs.  
> All units are explicitly stated. All formulas match the codebase implementation.

---

## Table of Contents

1. [Vessel Fuel Consumption API (Edge Function)](#1-vessel-fuel-consumption-api)
2. [Voyage Time Calculations](#2-voyage-time-calculations)
3. [Bunker Consumption (Voyage Engine)](#3-bunker-consumption-voyage-engine)
4. [Bunker Cost](#4-bunker-cost)
5. [Cargo & Freight Revenue](#5-cargo--freight-revenue)
6. [Voyage Costs](#6-voyage-costs)
7. [Profitability Metrics (TCE, NTCE, GTCE, P&L)](#7-profitability-metrics)
8. [Environmental / Emissions](#8-environmental--emissions)
9. [EU-Covered Fuel & FuelEU Maritime](#9-eu-covered-fuel--fueleu-maritime)
10. [Regulatory Cost Adjustments](#10-regulatory-cost-adjustments)

---

## 1. Vessel Fuel Consumption API

**Source:** `supabase/functions/vessel-fuel-api/index.ts`

When a vessel is searched, the API reads engine data from the upstream marine database and calculates daily fuel consumption (TPD = Tonnes Per Day).

### 1.1 Input Parameters (from vessel JSON)

| Parameter | Unit | Description |
|---|---|---|
| `main_engine1_mcr` | kW | Main Engine Maximum Continuous Rating |
| `main_engine1_sfoc` | g/kWh | Specific Fuel Oil Consumption |
| `scrubber_indicator` | boolean | Whether vessel has exhaust gas scrubber |

> **Null Handling:** If `MCR` or `SFOC` is null/0, the API returns `calculation_status: "insufficient_engine_data"` and `fuel_consumption: null`.

### 1.2 Operating Mode Constants

| Parameter | Full Speed | Eco Speed | Unit |
|---|---|---|---|
| ME Load | 85% (0.85) | 70% (0.70) | fraction of MCR |
| AE Load (Sea) | 4% (0.04) | 3.5% (0.035) | fraction of MCR |
| AE Load (Port) | 6% (0.06) | 6% (0.06) | fraction of MCR |
| Scrubber Penalty | 1.5% (0.015) | 1.2% (0.012) | fraction of base total |
| AE SFOC (constant) | 181 | 181 | g/kWh |

### 1.3 Main Engine Fuel (TPD)

```
ME_Fuel (t/day) = (MCR [kW] × ME_Load [fraction] × SFOC [g/kWh] × 24 [h/day]) / 1,000,000
```

### 1.4 Auxiliary Engine Fuel (TPD)

```
AE_kW = MCR [kW] × AE_Load [fraction]
AE_Fuel (t/day) = (AE_kW [kW] × AE_SFOC [g/kWh] × 24 [h/day]) / 1,000,000
```

Where `AE_SFOC = 181 g/kWh` (constant).

### 1.5 Fuel Type Selection by Zone

#### Outside ECA

| Condition | Fuel Type | Formula |
|---|---|---|
| `scrubber_indicator = true` | **HSFO** | TPD = ME_Fuel + AE_Sea_Fuel + Scrubber_Penalty |
| `scrubber_indicator = false` | **VLSFO** | TPD = ME_Fuel + AE_Sea_Fuel |

```
Scrubber_Penalty (t/day) = (ME_Fuel + AE_Sea_Fuel) × Scrubber_Penalty_Rate
```

**HSFO and VLSFO are never mixed.** If scrubber → HSFO only. No scrubber → VLSFO only.

#### Inside ECA

| Fuel Type | Formula |
|---|---|
| **LSMGO** | TPD = ME_Fuel + AE_Sea_Fuel |

Scrubber penalty is **ignored** inside ECA.

#### In Port

| Fuel Type | Formula |
|---|---|
| **LSMGO** | TPD = AE_Port_Fuel (ME = 0) |

Main engine is **not running** in port.

### 1.6 API Response Structure

```json
{
  "fuel_consumption": {
    "outside_eca": { "fuel_type": "HSFO|VLSFO", "me_tpd": 52.02, "ae_tpd": 2.61, "scrubber_penalty_tpd": 0.82, "tpd": 55.45 },
    "inside_eca":  { "fuel_type": "LSMGO", "me_tpd": 52.02, "ae_tpd": 2.61, "tpd": 54.63 },
    "in_port":     { "fuel_type": "LSMGO", "me_tpd": 0, "ae_tpd": 3.91, "tpd": 3.91 }
  }
}
```

---

## 2. Voyage Time Calculations

**Source:** `src/context/VoyageContext.tsx` (`calculateSeaTime`, `calculatePortDays`), `src/hooks/useVoyageCalculation.ts`

### 2.1 Speed Selection (Dual Speed Context)

Each leg has two speed contexts:
- **Non-ECA** (`distanceSpeedContext`): EV (Eco Voyage) or FV (Full Voyage)
- **ECA** (`ecaDistanceSpeedContext`): EL (Eco Local) or FL (Full Local)

Speed is selected from the vessel's consumption matrix based on context and laden/ballast state:

```
Speed = Matrix[eco|full].speed.[ballast|laden]
```

### 2.2 Sea Time per Leg

```
Base_Non_ECA_Time (days) = Non_ECA_Distance [nm] / (Non_ECA_Speed [kn] × 24)
Base_ECA_Time (days) = ECA_Distance [nm] / (ECA_Speed [kn] × 24)
Base_Sea_Time (days) = Base_Non_ECA_Time + Base_ECA_Time
```

With sea margin applied:

```
Sea_Margin_Multiplier = 1 + Sea_Margin [%] / 100
Sea_Margin_Time (days) = Base_Sea_Time × (Sea_Margin [%] / 100)
Sea_Time (days) = Base_Non_ECA_Time × Sea_Margin_Multiplier   (non-ECA with margin)
ECA_Time (days) = Base_ECA_Time × Sea_Margin_Multiplier        (ECA with margin)
Total_Leg_Time (days) = Base_Sea_Time + Sea_Margin_Time
```

### 2.3 Ballast / Laden Assignment

Determined by **running cargo on board** before the current port operation:
- `cargoOnBoard > 0` → leg is **Laden**
- `cargoOnBoard = 0` → leg is **Ballast**
- Loading adds quantity, Discharging subtracts quantity (tracked sequentially)

### 2.4 Port Time per Leg

```
Base_Port_Days = Cargo_Quantity [mt] / Productivity_Rate [mt/day]
Port_Days_With_Terms = Base_Port_Days × Coefficient_Factor
Total_Port_Days = Port_Days_With_Terms + (Turn_Time [h] + Extra_Time [h]) / 24
```

**Terms Coefficient (editable, defaults):**

| Terms | Default Coefficient |
|---|---|
| SHINC | 1.0 |
| SSHEX | 1.5 |
| FHEX | 1.25 |
| SATPN | 1.33 |
| Custom | User-defined |

For PSSG/Bunkering operations: `Port_Days = (Turn_Time + Extra_Time) / 24`

### 2.5 Port Time Split (Consumption Context)

Port time is split into:
- **Working Days** = `Total_Port_Days - (Turn_Time + Extra_Time) / 24`
- **Idle/Turn/Extra Days** = `(Turn_Time + Extra_Time) / 24`

Working days use Load/Discharge fuel rates; Turn/Extra time uses **Idle** consumption rate.

### 2.6 Total Voyage Duration

```
Total_Sea_Days = Sea_Days_Ballast + Sea_Days_Laden + Extra_Sea_Days
Total_Voyage_Days = Total_Sea_Days + Total_Port_Days + Extra_Port_Days + Extra_Canal_Days
```

---

## 3. Bunker Consumption (Voyage Engine)

**Source:** `src/hooks/useVoyageCalculation.ts`

Uses the vessel's **Consumption Matrix** (MT/day rates per mode) multiplied by time.

### 3.1 Core Formula

```
Consumption (MT) = Daily_Rate (MT/day) × Time (days) × Reward_Factor
```

- `Reward_Factor` defaults to **1.0** (adjustable for wind-assisted propulsion)

### 3.2 Sea Consumption — Non-ECA Zones

**Scrubber logic:** Scrubber → HSFO only (VLSFO = 0). No scrubber → VLSFO only (HSFO = 0).

```
HSFO_Sea = (NonECA_Ballast_Days × HSFO_Ballast_Rate
          + NonECA_Laden_Days × HSFO_Laden_Rate
          + Extra_Sea_Days × HSFO_Laden_Rate) × Reward_Factor     [only if scrubber]

VLSFO_Sea = (NonECA_Ballast_Days × VLSFO_Ballast_Rate
           + NonECA_Laden_Days × VLSFO_Laden_Rate
           + Extra_Sea_Days × VLSFO_Laden_Rate) × Reward_Factor   [only if no scrubber]

LSMGO_Sea_NonECA = 0   (LSMGO is NOT used outside ECA zones for ME)
```

### 3.3 Sea Consumption — ECA Zones

In ECA, **HSFO = 0, VLSFO = 0**. Vessel burns LSMGO at the LSMGO matrix rate:

```
LSMGO_ECA = (ECA_Ballast_Days × LSMGO_Ballast_Rate
           + ECA_Laden_Days × LSMGO_Laden_Rate) × Reward_Factor
```

### 3.4 Port Consumption (by operation, per-leg fuel type)

Each port leg has a **selectable fuel type** (`portFuelType`: hsfo, vlsfo, or lsmgo). Port days are tracked separately by fuel type.

```
[Fuel]_Loading (MT) = Loading_Days_[fuel] × [Fuel]_Load_Rate
[Fuel]_Discharging (MT) = Discharging_Days_[fuel] × [Fuel]_Discharge_Rate
[Fuel]_Idle (MT) = (Idle_Days_[fuel] + Bunkering_Days_[fuel] + Extra_Port_Days_[fuel]) × [Fuel]_Idle_Rate
```

**Turn time and Extra time** at load/discharge ports are added to **idle** consumption (not working consumption).

**Extra Port Days** (from Misc section) use default fuel: Scrubber → HSFO idle rate, else → VLSFO idle rate.

### 3.5 Canal Consumption

```
HSFO_Canal = Canal_Days × HSFO_Canal_Rate    [only if scrubber]
VLSFO_Canal = Canal_Days × VLSFO_Canal_Rate  [only if no scrubber]
LSMGO_Canal = 0   (LSMGO canal only via AE, but AE is excluded during canal)
```

### 3.6 AE (Auxiliary Engine) Consumption

AE always runs on LSMGO. If scrubber is fitted, uses **aeScrubber** rates; otherwise uses **ae** rates.

**AE at Sea** (all zones — both ECA and non-ECA):
```
AE_Sea (MT) = ((NonECA_Ballast + ECA_Ballast) × AE_Ballast_Rate
             + (NonECA_Laden + ECA_Laden) × AE_Laden_Rate
             + Extra_Sea_Days × AE_Laden_Rate) × Reward_Factor
```

**AE in Port:**
```
AE_Port (MT) = Loading_Days × AE_Load_Rate
             + Discharging_Days × AE_Discharge_Rate
             + (Idle_Days + Bunkering_Days + Extra_Port_Days) × AE_Idle_Rate
```

**AE during Canal:**
```
AE_Canal = 0   (AE is NOT counted during canal transit)
```

```
LSMGO_AE_Total (MT) = AE_Sea + AE_Port
```

### 3.7 Total Fuel Consumption

```
HSFO_Total (MT) = HSFO_Sea + HSFO_Loading + HSFO_Discharging + HSFO_Idle + HSFO_Canal
VLSFO_Total (MT) = VLSFO_Sea + VLSFO_Loading + VLSFO_Discharging + VLSFO_Idle + VLSFO_Canal
LSMGO_Total (MT) = LSMGO_Sea + LSMGO_Loading + LSMGO_Discharging + LSMGO_Idle + LSMGO_Canal + LSMGO_AE_Total
```

---

## 4. Bunker Cost

**Source:** `src/hooks/useVoyageCalculation.ts`

```
HSFO_Cost ($) = HSFO_Total (MT) × HSFO_Price ($/MT)
VLSFO_Cost ($) = VLSFO_Total (MT) × VLSFO_Price ($/MT)
LSMGO_Cost ($) = LSMGO_Total (MT) × LSMGO_Price ($/MT)

Total_Bunker_Cost ($) = HSFO_Cost + VLSFO_Cost + LSMGO_Cost
```

Prices are user-input in the Bunker Section (USD/MT).

---

## 5. Cargo & Freight Revenue

**Source:** `src/hooks/useVoyageCalculation.ts`

### 5.1 Gross Freight

```
If rate_type = "mt":     Gross_Freight ($) = Freight_Rate ($/MT) × Cargo_Quantity (MT)
If rate_type = "lumpsum": Gross_Freight ($) = Freight_Rate ($)
```

### 5.2 Voyage Commission

```
Voyage_Commission ($) = Gross_Freight × (Voyage_Commission_% / 100)
```

> **TC Commission does NOT reduce freight.** It only reduces hire (see §6.1).

### 5.3 Net Freight

```
Net_Freight ($) = Gross_Freight - Voyage_Commission
```

---

## 6. Voyage Costs

**Source:** `src/hooks/useVoyageCalculation.ts`

```
Misc_Costs ($) = Misc_Cost + Extra_Fees + Extra_Insurance
Canal_Costs ($) = Canal_Cost_1 + Canal_Cost_2
Port_Costs ($) = Σ (Expected DA per port)

Total_Voyage_Costs ($) = Total_Bunker_Cost + Port_Costs + Misc_Costs + Canal_Costs
```

> **Note:** Commissions are NOT included in voyage costs. Voyage commission reduces freight; TC commission reduces hire.

### 6.1 Hire Calculations

```
Gross_Hire_Rate ($/day) = User input
TC_Commission_Pct = TC_Commission_% / 100
Net_Hire_Rate ($/day) = Gross_Hire_Rate × (1 - TC_Commission_Pct)

Hire_Cost ($) = Gross_Hire_Rate × Total_Voyage_Days + Net_BB
Net_Hire_Cost ($) = Net_Hire_Rate × Total_Voyage_Days + Net_BB
TC_Commission_Amount ($) = (Gross_Hire_Rate × Total_Voyage_Days) × TC_Commission_Pct

Voyage_Cost_Incl_Hire ($) = Total_Voyage_Costs + Hire_Cost
Voyage_Cost_Excl_Hire ($) = Total_Voyage_Costs
```

Where `Net_BB` = Net Ballast Bonus (lumpsum, default 0).

### 6.2 Gross Rate

```
Base_Rate_Per_MT = Voyage_Cost_Incl_Hire / Cargo_Quantity
Gross_Rate ($/MT) = Base_Rate_Per_MT / (1 - Voyage_Commission_%)
```

---

## 7. Profitability Metrics

**Source:** `src/hooks/useVoyageCalculation.ts`

### 7.1 Voyage Result

```
Voyage_Result ($) = Net_Freight - Total_Voyage_Costs + Demurrage - Despatch
```

### 7.2 NTCE (Net Time Charter Equivalent)

```
NTCE ($/day) = (Net_Freight - Total_Voyage_Costs) / Total_Voyage_Days
```

### 7.3 GTCE (Gross Time Charter Equivalent)

```
GTCE ($/day) = NTCE / (1 - TC_Commission_Pct)
```

### 7.4 TCE (Time Charter Equivalent)

```
TCE ($/day) = GTCE   (functionally equivalent)
```

### 7.5 P&L (Profit & Loss)

```
P&L ($) = Voyage_Result - Hire_Cost
```

---

## 8. Environmental / Emissions

**Source:** `src/utils/emissionCalculations.ts`

### 8.1 CO₂ Emission Factors

| Fuel | Factor | Unit |
|---|---|---|
| HSFO | 3.114 | t CO₂ / t fuel |
| VLSFO | 3.151 | t CO₂ / t fuel |
| LSMGO | 3.206 | t CO₂ / t fuel |

### 8.2 Total CO₂

```
CO₂_HSFO (t) = HSFO_Total (MT) × 3.114
CO₂_VLSFO (t) = VLSFO_Total (MT) × 3.151
CO₂_LSMGO (t) = LSMGO_Total (MT) × 3.206

Total_CO₂ (t) = CO₂_HSFO + CO₂_VLSFO + CO₂_LSMGO
```

### 8.3 CO₂ Split (Ballast / Laden)

```
CO₂_Ballast = Total_CO₂ × (Sea_Days_Ballast / Total_Sea_Days)
CO₂_Laden = Total_CO₂ × (Sea_Days_Laden / Total_Sea_Days)
```

### 8.4 CII Rating (IMO Methodology)

```
Actual_CII (gCO₂/dwt·nm) = (Total_CO₂ [t] × 1,000,000) / (DWT [t] × Total_Distance [nm])

Required_CII = a × DWT^(-c) × (1 - Reduction_Factor)
```

| Ship Type | a | c |
|---|---|---|
| Bulk Carrier | 4745 | 0.622 |
| Tanker | 5247 | 0.610 |
| Container | 1984 | 0.489 |
| General Cargo | 588 | 0.3885 |

Reduction factors by year: 2023: 5%, 2024: 7%, 2025: 9%, 2026: 11%

```
CII_Ratio = Actual_CII / Required_CII
```

| Rating | CII Ratio Range |
|---|---|
| A | ≤ 0.82 |
| B | 0.82 – 0.93 |
| C | 0.93 – 1.08 |
| D | 1.08 – 1.20 |
| E | > 1.20 |

### 8.5 EFOI (Energy Efficiency Operational Indicator)

```
EFOI (gCO₂/t·nm) = (Total_CO₂ [t] × 1,000,000) / (Cargo_Carried [t] × Laden_Distance [nm])
```

### 8.6 EU ETS Cost

EU ETS coverage is determined using **is_eu_eea port flags** (not ECA distance). Each segment's coverage is based on origin and destination port flags.

```
Leg_Coverage = based on origin/destination EU/EEA flags (see table)
Leg_CO₂ = Total_CO₂ × (Leg_Sea_Time / Total_Sea_Days)
Chargeable_CO₂ (t) = Σ (Leg_CO₂ × Leg_Coverage × Phase_In_%)

ETS_Cost ($) = Chargeable_CO₂ × CO₂_Price ($/t)
```

| Voyage Type | Coverage |
|---|---|
| EU → EU | 100% |
| EU → Non-EU | 50% |
| Non-EU → EU | 50% |
| Non-EU → Non-EU | 0% |

Phase-in: 2024 = 40%, 2025 = 70%, 2026+ = 100%

**Derived metrics:**
```
Total_CO₂_Cost ($) = Total_CO₂ × CO₂_Price
EUA_CO₂_Cost ($) = Chargeable_CO₂ × CO₂_Price   (same as ETS_Cost)
EUA_Freight_Impact ($/MT) = EUA_CO₂_Cost / Cargo_Quantity
```

---

## 9. EU-Covered Fuel & FuelEU Maritime

**Source:** `src/hooks/useVoyageCalculation.ts`, `src/utils/emissionCalculations.ts`

### 9.1 EU-Covered Fuel Calculation

EU-covered fuel is calculated **segment-wise** for each voyage leg:

**Sea segments:**
- EU factor: 1.0 (EU→EU), 0.5 (EU↔Non-EU), 0.0 (Non-EU→Non-EU)
- Covered fuel = Segment fuel consumption × EU factor

**Port segments:**
- EU factor: 1.0 if port is EU/EEA, 0.0 otherwise
- Port fuel split into: Working time (load/discharge rate) + Turn time (idle rate) + Extra time (idle rate)
- AE fuel at port is also EU-covered if EU port

**Extra time (from Misc section):**
- Extra sea days: weighted average EU sea factor across all segments
- Extra port days: proportion of EU ports to total ports
- Extra canal days: weighted average EU sea factor

### 9.2 FuelEU Maritime Cost

Uses a simplified static-rate model:

```
FuelEU_Cost ($) = Σ (EU_Covered_Fuel[type] × Static_Rate[type])
```

| Fuel | Static Rate ($/ton) |
|---|---|
| HSFO | 71.64 |
| VLSFO | 61.94 |
| LSMGO | 45.37 |

```
FuelEU_Freight_Impact ($/MT) = FuelEU_Total_Penalty / Cargo_Quantity
```

---

## 10. Regulatory Cost Adjustments

**Source:** `src/hooks/useVoyageCalculation.ts`

When regulatory impact toggles are enabled, costs are added to voyage expenses:

```
Regulatory_Cost ($) = 0
If applyEuaImpact:    Regulatory_Cost += EUA_CO₂_Cost
If applyFuelEuImpact: Regulatory_Cost += FuelEU_Total_Penalty

Adjusted_Voyage_Cost_Excl_Hire = Voyage_Cost_Excl_Hire + Regulatory_Cost
Adjusted_Voyage_Cost_Incl_Hire = Voyage_Cost_Incl_Hire + Regulatory_Cost
```

All profitability metrics (NTCE, GTCE, TCE, P&L, Gross Rate) are **recalculated** using adjusted voyage costs when toggles are active.

---

*Generated from codebase on 2026-04-08. All formulas verified against source files.*
