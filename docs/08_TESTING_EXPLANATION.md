# Testing Suite

**Framework:** Vitest  
**Config:** `vitest.config.ts`

---

## 1. Test Structure

```
src/test/
├── setup.ts                              # Test environment setup
├── helpers/
│   ├── mockVesselData.ts                 # VesselData factory
│   └── mockSequenceData.ts              # SequenceRow, CargoData, BunkerData factories
│
├── unit/
│   ├── vesselSection.test.ts            # Vessel profile resolution
│   ├── voyageTime.test.ts               # Distance, sea days, port days
│   ├── bunkering.test.ts                # Fuel consumption & costs
│   ├── cargoEconomics.test.ts           # Freight, commissions, TCE/NTCE/GTCE
│   └── miscSection.test.ts             # Misc costs, canal costs, extra time
│
└── integration/
    └── voyageCalculation.test.ts        # Full pipeline verification
```

---

## 2. Mock Data Helpers

### `mockVesselData.ts`
Creates a complete `VesselData` object with:
- DWT = 58,000 (Supramax category)
- Both eco and full speed consumption matrices
- All required fields populated

### `mockSequenceData.ts`
Provides factory functions for:
- `createMockSequence()` — 3-leg voyage: Open → Loading → Discharging
- `createMockCargo()` — $15/mt, 50,000 MT, 3.75% voy commission, 2.5% TC commission
- `createMockBunker()` — HSFO $500, VLSFO $600, LSMGO $750

---

## 3. Unit Tests

### Vessel Section (`vesselSection.test.ts`)
- ✅ Eco profile uses `ecoConsumption` matrix
- ✅ Full profile uses `fullConsumption` matrix
- ✅ Reward factor modifies fuel consumption

### Voyage Time (`voyageTime.test.ts`)
- ✅ Total distance = sum of all leg distances
- ✅ Sea days correctly split between ballast and laden
- ✅ Sea margin time calculated correctly
- ✅ Total voyage days = sea + port + extras

### Bunkering (`bunkering.test.ts`)
- ✅ ECA zones switch fuel to LSMGO only (HSFO/VLSFO = 0 in ECA)
- ✅ Total bunker cost = Σ(consumption × price)
- ✅ AE consumption included in LSMGO total

### Cargo Economics (`cargoEconomics.test.ts`)
- ✅ Per-MT freight = rate × quantity
- ✅ Lumpsum freight = rate directly
- ✅ Voyage commission = gross freight × commission%
- ✅ NTCE = (Net Freight - Voyage Costs) / Total Days
- ✅ GTCE = NTCE / (1 - TC Commission Rate)
- ✅ TCE = GTCE

### Misc Section (`miscSection.test.ts`)
- ✅ Misc costs = miscCost + extraFees + extraInsurance
- ✅ Canal costs = canalCost1 + canalCost2
- ✅ Extra time adds to total voyage days

---

## 4. Integration Test

### `voyageCalculation.test.ts`
Full end-to-end pipeline test:
- ✅ Voyage costs = bunker + port + misc + canal
- ✅ Cross-section consistency (costs sum correctly)
- ✅ CO₂ emissions calculated from fuel consumption
- ✅ CII rating is a valid grade (A–E)
- ✅ All result fields are finite numbers

---

## 5. Running Tests

```bash
bun run test          # Run all tests
bun run test -- --reporter=verbose  # Detailed output
```

All tests use `renderHook` from `@testing-library/react` to test `useVoyageCalculation` directly with mock inputs.
