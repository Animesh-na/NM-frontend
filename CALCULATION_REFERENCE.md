# Voyage Calculation Reference — Full Mathematical Breakdown

> **Scope:** From vessel search → fuel consumption API → voyage time → bunker consumption → bunker cost → freight → profitability → emissions.  
> All units are explicitly stated. All formulas match the codebase implementation.

---

## Table of Contents

1. [Vessel Fuel Consumption API (Edge Function)](#1-vessel-fuel-consumption-api)
2. [Voyage Time Calculations](#2-voyage-time-calculations)
3. [Bunker Consumption (Voyage Engine)](#3-bunker-consumption-voyage-engine)
4. [Bunker Cost](#4-bunker-cost)
5. [Cargo & Freight Revenue](#5-cargo--freight-revenue)
6. [Voyage Costs](#6-voyage-costs)
7. [Profitability Metrics (TCE, NTCE, P&L)](#7-profitability-metrics)
8. [Environmental / Emissions](#8-environmental--emissions)

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

**Example (Full Speed):**
- MCR = 15,000 kW, SFOC = 170 g/kWh
- ME_Fuel = (15000 × 0.85 × 170 × 24) / 1,000,000 = **52.02 t/day**

### 1.4 Auxiliary Engine Fuel (TPD)

```
AE_kW = MCR [kW] × AE_Load [fraction]
AE_Fuel (t/day) = (AE_kW [kW] × AE_SFOC [g/kWh] × 24 [h/day]) / 1,000,000
```

Where `AE_SFOC = 181 g/kWh` (constant).

**AE at Sea (Full Speed):**
- AE_kW = 15000 × 0.04 = 600 kW
- AE_Fuel = (600 × 181 × 24) / 1,000,000 = **2.61 t/day**

**AE in Port (Full Speed):**
- AE_kW = 15000 × 0.06 = 900 kW
- AE_Fuel = (900 × 181 × 24) / 1,000,000 = **3.91 t/day**

### 1.5 Fuel Type Selection by Zone

#### Outside ECA

| Condition | Fuel Type | Formula |
|---|---|---|
| `scrubber_indicator = true` | **HSFO** | TPD = ME_Fuel + AE_Sea_Fuel + Scrubber_Penalty |
| `scrubber_indicator = false` | **VLSFO** | TPD = ME_Fuel + AE_Sea_Fuel |

```
Scrubber_Penalty (t/day) = (ME_Fuel + AE_Sea_Fuel) × Scrubber_Penalty_Rate
```

- Full Speed: Scrubber_Penalty_Rate = 0.015
- Eco: Scrubber_Penalty_Rate = 0.012

**HSFO and VLSFO are never mixed.** If scrubber → HSFO only. No scrubber → VLSFO only.

Also:
- `hsfo_allowed = true` if `scrubber_indicator = true`, else `false`

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

**Source:** `src/hooks/useVoyageCalculation.ts` (lines 159–243), `VoyageContext.tsx`

### 2.1 Sea Time per Leg

```
Base_Sea_Time (days) = (Non_ECA_Distance [nm] / Sea_Speed [kn] + ECA_Distance [nm] / ECA_Speed [kn]) / 24 [h/day]
```

With sea margin applied:

```
Adjusted_Sea_Time (days) = Base_Sea_Time × (1 + Sea_Margin [%] / 100)
Sea_Margin_Time (days) = Adjusted_Sea_Time - Base_Sea_Time
```

### 2.2 ECA / Non-ECA Time Split

```
Non_ECA_Time (days) = (Non_ECA_Distance [nm] / Sea_Speed [kn]) / 24 × (1 + SM%)
ECA_Time (days) = (ECA_Distance [nm] / ECA_Speed [kn]) / 24 × (1 + SM%)
```

### 2.3 Port Time per Leg

```
Working_Days = Cargo_Quantity [mt] / Productivity_Rate [mt/day] × Terms_Multiplier
Total_Port_Days = Working_Days + (Turn_Time [h] + Extra_Time [h]) / 24
```

### 2.4 Total Voyage Duration

```
Total_Sea_Days = Sea_Days_Ballast + Sea_Days_Laden + Extra_Sea_Days
Total_Voyage_Days (days) = Total_Sea_Days + Total_Port_Days + Extra_Port_Days + Extra_Canal_Days
```

---

## 3. Bunker Consumption (Voyage Engine)

**Source:** `src/hooks/useVoyageCalculation.ts` (lines 244–349)

The voyage engine uses the vessel's **Consumption Matrix** (MT/day rates per mode) multiplied by time.

### 3.1 Core Formula

```
Consumption (MT) = Daily_Rate (MT/day) × Time (days) × Reward_Factor
```

- `Reward_Factor` defaults to **1.0** (adjustable for wind-assisted propulsion)

### 3.2 Sea Consumption — Non-ECA Zones

HSFO/VLSFO burn at their normal matrix rates. **LSMGO is NOT used outside ECA zones** (ME LSMGO = 0).

```
HSFO_Sea = (Non_ECA_Ballast_Days × HSFO_Ballast_Rate + Non_ECA_Laden_Days × HSFO_Laden_Rate + Extra_Sea_Days × HSFO_Laden_Rate) × Reward_Factor
```

```
VLSFO_Sea = (Non_ECA_Ballast_Days × VLSFO_Ballast_Rate + Non_ECA_Laden_Days × VLSFO_Laden_Rate + Extra_Sea_Days × VLSFO_Laden_Rate) × Reward_Factor
```

```
LSMGO_Sea_NonECA = 0
```

### 3.3 Sea Consumption — ECA Zones

In ECA, **HSFO = 0, VLSFO = 0**. Vessel burns LSMGO at the **LSMGO matrix rate directly** (not a combined rate):

```
LSMGO_ECA = (ECA_Ballast_Days × LSMGO_Ballast_Rate + ECA_Laden_Days × LSMGO_Laden_Rate) × Reward_Factor
```

### 3.4 Total LSMGO Sea

```
LSMGO_Sea_Total (MT) = LSMGO_ECA   (Non-ECA LSMGO = 0)
```

### 3.5 Port Consumption (by operation)

```
[Fuel]_Loading (MT) = Loading_Days × [Fuel]_Load_Rate
[Fuel]_Discharging (MT) = Discharging_Days × [Fuel]_Discharge_Rate
[Fuel]_Idle (MT) = (Idle_Days + Bunkering_Days + Extra_Port_Days) × [Fuel]_Idle_Rate
[Fuel]_Canal (MT) = (Canal_Days + Extra_Canal_Days) × [Fuel]_Canal_Rate
```

Where `[Fuel]` = HSFO, VLSFO, or LSMGO.

### 3.6 AE (Auxiliary Engine) Consumption (added to LSMGO)

AE always runs on LSMGO across **all operations EXCEPT canal**.

```
AE_Sea (MT) = (Total_Ballast_Days × AE_Ballast_Rate + Total_Laden_Days × AE_Laden_Rate + Extra_Sea_Days × AE_Laden_Rate) × Reward_Factor
```

Where `Total_Ballast_Days = Non_ECA_Ballast + ECA_Ballast` and `Total_Laden_Days = Non_ECA_Laden + ECA_Laden`.

```
AE_Port (MT) = Loading_Days × AE_Load_Rate
             + Discharging_Days × AE_Discharge_Rate
             + (Idle_Days + Bunkering_Days + Extra_Port_Days) × AE_Idle_Rate
```

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
LSMGO_Total (MT) = LSMGO_Sea_Total + LSMGO_Loading + LSMGO_Discharging + LSMGO_Idle + LSMGO_Canal + LSMGO_AE_Total
```

---

## 4. Bunker Cost

**Source:** `src/hooks/useVoyageCalculation.ts` (lines 352–365)

```
HSFO_Cost ($) = HSFO_Total (MT) × HSFO_Price ($/MT)
VLSFO_Cost ($) = VLSFO_Total (MT) × VLSFO_Price ($/MT)
LSMGO_Cost ($) = LSMGO_Total (MT) × LSMGO_Price ($/MT)

Total_Bunker_Cost ($) = HSFO_Cost + VLSFO_Cost + LSMGO_Cost
```

Prices are user-input in the Bunker Section (USD/MT).

---

## 5. Cargo & Freight Revenue

**Source:** `src/hooks/useVoyageCalculation.ts` (lines 367–377)

### 5.1 Gross Freight

```
If rate_type = "mt":     Gross_Freight ($) = Freight_Rate ($/MT) × Cargo_Quantity (MT)
If rate_type = "lumpsum": Gross_Freight ($) = Freight_Rate ($)
```

### 5.2 Commissions

```
Voyage_Commission ($) = Gross_Freight × (Voyage_Commission_% / 100)
TC_Commission_on_Freight ($) = Gross_Freight × (TC_Commission_% / 100)
```

### 5.3 Net Freight

```
Net_Freight ($) = Gross_Freight - Voyage_Commission - TC_Commission_on_Freight
```

---

## 6. Voyage Costs

**Source:** `src/hooks/useVoyageCalculation.ts` (lines 379–394)

```
Misc_Costs ($) = Misc_Cost + Extra_Fees + Extra_Insurance
Canal_Costs ($) = Canal_Cost_1 + Canal_Cost_2
Port_Costs ($) = Σ (Expected DA per port)

Total_Voyage_Costs ($) = Total_Bunker_Cost + Port_Costs + Misc_Costs + Canal_Costs
```

> **Note:** Commissions are NOT included in voyage costs. They reduce freight revenue.

### 6.1 Hire Calculations

```
Gross_Hire_Rate ($/day) = User input
Net_Hire_Rate ($/day) = Gross_Hire_Rate × (1 - TC_Commission_%)
Hire_Cost ($) = Gross_Hire_Rate × Total_Voyage_Days
Net_Hire_Cost ($) = Net_Hire_Rate × Total_Voyage_Days

Voyage_Cost_Incl_Hire ($) = Total_Voyage_Costs + Hire_Cost
Voyage_Cost_Excl_Hire ($) = Total_Voyage_Costs
```

---

## 7. Profitability Metrics

**Source:** `src/hooks/useVoyageCalculation.ts` (lines 396–417)

### 7.1 Voyage Result

```
Voyage_Result ($) = Net_Freight - Total_Voyage_Costs + Demurrage - Despatch
```

### 7.2 TCE (Time Charter Equivalent)

```
TCE ($/day) = Voyage_Result / Total_Voyage_Days
```

### 7.3 NTCE (Net TCE)

```
NTCE ($/day) = (Net_Freight - Total_Voyage_Costs + Demurrage - Despatch - Net_Hire_Cost) / Total_Voyage_Days
```

### 7.4 GTCE (Gross TCE)

```
GTCE ($/day) = (Gross_Freight - Voyage_Cost_Excl_Hire) / Total_Voyage_Days
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
| VLSFO | 3.114 | t CO₂ / t fuel |
| LSMGO | 3.206 | t CO₂ / t fuel |

### 8.2 Total CO₂

```
CO₂_HSFO (t) = HSFO_Total (MT) × 3.114
CO₂_VLSFO (t) = VLSFO_Total (MT) × 3.114
CO₂_LSMGO (t) = LSMGO_Total (MT) × 3.206

Total_CO₂ (t) = CO₂_HSFO + CO₂_VLSFO + CO₂_LSMGO
```

### 8.3 CII Rating (IMO Methodology)

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

### 8.4 EFOI (Energy Efficiency Operational Indicator)

```
EFOI (gCO₂/t·nm) = (Total_CO₂ [t] × 1,000,000) / (Cargo_Carried [t] × Laden_Distance [nm])
```

### 8.5 EU ETS Cost

```
Chargeable_CO₂ (t) = Σ (Leg_CO₂ × Coverage_% × Phase_In_%)
ETS_Cost ($) = Chargeable_CO₂ × CO₂_Price ($/t)
```

| Voyage Type | Coverage |
|---|---|
| EU → EU | 100% |
| EU → Non-EU | 50% |
| Non-EU → EU | 50% |
| Non-EU → Non-EU | 0% |

Phase-in: 2024 = 40%, 2025 = 70%, 2026+ = 100%

---

## End-to-End Example

**Given:**
- MCR = 10,000 kW, SFOC = 165 g/kWh, Scrubber = true, Mode = Eco
- Distance = 3,000 nm (Non-ECA: 2,500 nm, ECA: 500 nm), Speed = 12 kn
- Cargo = 50,000 MT @ $15/MT, Voy Commission = 3.75%, TC Commission = 2.5%
- HSFO Price = $500/MT, VLSFO Price = $600/MT, LSMGO Price = $750/MT
- Hire Rate = $15,000/day

**Step 1 — API Fuel Rates (Eco):**
- ME_Fuel = (10000 × 0.70 × 165 × 24) / 1,000,000 = **27.72 t/day**
- AE_Sea = (10000 × 0.035 × 181 × 24) / 1,000,000 = **1.52 t/day**
- AE_Port = (10000 × 0.06 × 181 × 24) / 1,000,000 = **2.61 t/day**
- Outside ECA (HSFO): Base = 27.72 + 1.52 = 29.24, Penalty = 29.24 × 0.012 = 0.35, **Total = 29.59 t/day**
- Inside ECA (LSMGO): **29.24 t/day**
- In Port (LSMGO): **2.61 t/day**

**Step 2 — Sea Time:**
- Non-ECA: 2500 / (12 × 24) = 8.68 days
- ECA: 500 / (12 × 24) = 1.74 days
- Total (with 5% SM): (8.68 + 1.74) × 1.05 = **10.94 days**

**Step 3 — Consumption (using vessel matrix rates):**
- HSFO Sea (Non-ECA only) = 8.68 × 1.05 × HSFO_Rate
- LSMGO ECA = 1.74 × 1.05 × Combined_Rate
- *(Actual values depend on vessel consumption matrix populated from DWT estimates)*

**Step 4 — Bunker Cost:**
- Total_Bunker_Cost = HSFO_MT × 500 + VLSFO_MT × 600 + LSMGO_MT × 750

**Step 5 — Freight:**
- Gross Freight = 50,000 × 15 = $750,000
- Voy Commission = 750,000 × 0.0375 = $28,125
- TC Commission = 750,000 × 0.025 = $18,750
- Net Freight = 750,000 - 28,125 - 18,750 = **$703,125**

**Step 6 — TCE:**
- TCE = (Net_Freight - Total_Voyage_Costs) / Total_Voyage_Days

---

*Generated from codebase on 2026-02-20. All formulas verified against source files.*
