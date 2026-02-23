# VoyageContext — State Management

**File:** `src/context/VoyageContext.tsx` (1,123 lines)

---

## 1. Purpose

`VoyageContext` is the **central nervous system** of the application. It holds all user inputs, computes derived values (port days, sea times, distances), and feeds everything into the calculation engine.

---

## 2. State Slices

### 2.1 Vessel (`VesselData`)
```typescript
const [vessel, setVessel] = useState<VesselData>(defaultVessel);
```
Holds vessel particulars (name, IMO, DWT, GT, draft) and consumption matrices (eco + full speed). Updated when user selects a vessel from search or enters manually.

### 2.2 Sequence (`SequenceRowUI[]`)
```typescript
const [sequence, setSequence] = useState<SequenceRowUI[]>(initialSequence);
```
Ordered list of voyage legs. Each row has:
- **Type**: `open` (starting position), `port` (loading/discharging/bunkering/pssg), `repos` (repositioning)
- **Port info**: name, UNLOC code, coordinates, portId
- **Distance**: Non-ECA distance + ECA distance (auto-calculated or manual)
- **Speed context**: `EV`/`FV` (Non-ECA) and `EL`/`FL` (ECA) — determines which consumption matrix
- **Cargo**: quantity (MT), productivity (MT/day), terms (SHINC/SSHEX/FHEX/SATPN)
- **Time**: turn time (hours), extra time (hours), sea margin (%)
- **Calculated fields**: `calculatedPortDays`, `baseSeaTime`, `seaMarginTime`, `ecaTime`, `seaTime`, `totalLegTime`

### 2.3 Cargos (`CargoEntry[]`)
```typescript
const [cargos, setCargos] = useState<CargoEntry[]>(initialCargos);
```
Multi-cargo support. Each entry has: freight rate, rate type (per-MT or lumpsum), commission percentages, demurrage/despatch rates.

### 2.4 Bunker (`BunkerState`)
```typescript
const [bunker, setBunker] = useState<BunkerState>(initialBunker);
```
Fuel prices (HSFO, VLSFO, LSMGO), ROB at start, CO₂ price, reward factor, fuel accounting mode, and port bunkering events.

### 2.5 Misc (`MiscState`)
```typescript
const [misc, setMisc] = useState<MiscState>(initialMisc);
```
Miscellaneous costs (misc, extra fees, insurance), canal costs, trade type, and extra time entries (canal, idle port, at sea).

### 2.6 Hire Rate
```typescript
const [hireRate, setHireRate] = useState(8542);
```
Daily hire rate in $/day for TCE comparison.

---

## 3. Key Helper Functions

### 3.1 `calculatePortDays(row: SequenceRowUI)`
Derives total port days from cargo quantity, productivity, terms multiplier, and turn/extra time.

```
Working_Days = Quantity / Productivity × Terms_Multiplier
Total_Port_Days = Working_Days + (Turn_Time + Extra_Time) / 24
```

**Terms multipliers:**
| Terms | Multiplier | Meaning |
|-------|-----------|---------|
| SHINC | 1.0 | Sundays/Holidays Included |
| SSHEX | 1.5 | Saturdays/Sundays/Holidays Excluded |
| FHEX | 1.25 | Fridays/Holidays Excluded |
| SATPN | 1.3333 | Saturday PM Excluded |

### 3.2 `getSpeedForContext(context, isLaden, vessel)`
Resolves the correct speed from the vessel's consumption matrix based on:
- Speed context (`EV`/`EL` → eco matrix, `FV`/`FL` → full matrix)
- Laden state (laden speed vs ballast speed)

### 3.3 `calculateSeaTime(row, isLaden, vessel)`
Calculates sea time for a single leg:
```
baseNonEcaTime = distance / (speed × 24)
baseEcaTime = ecaDistance / (ecaSpeed × 24)
baseSeaTime = baseNonEcaTime + baseEcaTime
seaMarginTime = baseSeaTime × (seaMargin / 100)
totalLegTime = baseSeaTime + seaMarginTime
```

---

## 4. Auto-Distance Calculation

When `autoDistanceEnabled` is true, the context watches for port/coordinate changes and automatically calls the Marine API to get sea route distances:

```
Port changes detected (via portCoordsKey memo)
    → 500ms debounce
    → recalculateDistances()
        → For each consecutive port pair:
            → Call getSeaRouteDistance(lat1, lon1, lat2, lon2)
            → Returns { non_eca_distance_nm, eca_distance_nm }
        → Update sequence with distances
        → Recalculate sea times
```

**Skip conditions:**
- No open port selected
- Current or previous port missing
- Same port as previous
- Missing coordinates

---

## 5. Cargo Aggregation

Multi-cargo entries are aggregated into a single `CargoData` object for the calculation engine:
- Quantity comes from **sequence** (sum of loading quantities), not from cargo entries
- Freight rates are applied to sequence-derived quantity
- Commissions are averaged across entries
- Demurrage/despatch amounts are summed

---

## 6. State → Calculation Pipeline

```
VoyageContext state
    │
    ├── sequence.map() → SequenceRow[] (calculation format)
    │   • portDays = calculatedPortDays
    │   • seaTime = totalLegTime (includes sea margin)
    │   • turnTimeHours, extraTimeHours (for fuel split)
    │
    ├── aggregatedCargo → CargoData
    │
    ├── bunker → BunkerData (prices + rewardFactor)
    │
    ├── misc → MiscCostsData + ExtraTimeData
    │
    └── All combined → VoyageInputs
            │
            └── useVoyageCalculation(inputs) → VoyageResults
```

The `results` object is then provided via context to all child components (VoyageSummary, CalculationBreakdown, etc.).
