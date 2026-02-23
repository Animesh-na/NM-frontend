# Architecture Overview

## 1. Application Summary

VoyageCalc is a **maritime voyage estimation tool** built with React + TypeScript + Vite. It calculates voyage profitability, fuel consumption, and environmental compliance for dry-bulk shipping operations.

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript | UI rendering and state management |
| **Styling** | Tailwind CSS + shadcn/ui | Component library with design tokens |
| **Routing** | React Router DOM v6 | Client-side navigation |
| **State** | React Context API | Global voyage state management |
| **Data Fetching** | TanStack React Query | Async data caching (vessel search) |
| **Backend** | Lovable Cloud (Edge Functions) | API proxy, fuel calculations |
| **Build** | Vite | Dev server, bundling, HMR |
| **Testing** | Vitest | Unit + integration tests |

---

## 3. Project Structure

```
src/
├── App.tsx                    # Root component — auth gate + routing
├── main.tsx                   # Vite entry point
├── index.css                  # Design tokens (CSS variables)
│
├── context/
│   ├── AuthContext.tsx         # Simple auth gate (email/password)
│   └── VoyageContext.tsx       # Central state: vessel, sequence, cargo, bunker, misc
│
├── hooks/
│   └── useVoyageCalculation.ts # Pure calculation engine (useMemo)
│
├── utils/
│   ├── emissionCalculations.ts # CO₂, CII, EFOI, EU ETS formulas
│   └── seaRouteDistance.ts     # Local sea route calculation (searoute-js)
│
├── services/
│   ├── marineApi.ts            # Marine API proxy client (ports, vessels, routes)
│   └── vesselFuelApi.ts        # Vessel fuel consumption API client
│
├── data/
│   ├── vessels.ts              # Vessel types, interfaces, DWT estimation functions
│   └── ports.ts                # Port data utilities
│
├── pages/
│   ├── Index.tsx               # Main calculator page
│   ├── Login.tsx               # Authentication page
│   ├── CalculationBreakdown.tsx # Detailed results view
│   └── NotFound.tsx            # 404 page
│
├── components/
│   ├── voyage/                 # Main UI sections (VesselPanel, SequenceTable, etc.)
│   └── breakdown/              # Calculation breakdown panels
│
└── test/
    ├── unit/                   # Section-level unit tests
    ├── integration/            # End-to-end calculation tests
    └── helpers/                # Mock data factories
```

---

## 4. Data Flow Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        App.tsx                          │
│  AuthProvider → VoyageProvider → BrowserRouter           │
└────────────────────────┬────────────────────────────────┘
                         │
           ┌─────────────▼──────────────┐
           │     VoyageContext.tsx       │
           │                            │
           │  State:                    │
           │  • vessel: VesselData      │
           │  • sequence: SequenceRowUI[]│
           │  • cargos: CargoEntry[]    │
           │  • bunker: BunkerState     │
           │  • misc: MiscState         │
           │  • hireRate: number        │
           │                            │
           │  Computed:                 │
           │  • aggregatedCargo         │
           │  • voyageInputs            │
           │  • results (via hook)      │
           └─────────┬──────────────────┘
                     │
        ┌────────────▼─────────────┐
        │  useVoyageCalculation()  │
        │  (Pure useMemo engine)   │
        │                          │
        │  Inputs → VoyageResults  │
        │  • Time calculations     │
        │  • Fuel consumption      │
        │  • Revenue & costs       │
        │  • Profitability (TCE)   │
        │  • Emissions (CO₂/CII)  │
        └──────────────────────────┘
```

---

## 5. External API Integration

```
Browser  ──►  Edge Function (Proxy)  ──►  External Marine API
                                          (development.effimove.in)

Two edge functions:
1. marine-api       → Vessel search, port search, sea route distances
2. vessel-fuel-api  → Vessel fuel consumption (MCR/SFOC-based calculation)
```

The edge functions act as **CORS proxies** with API key injection. The browser never contacts the external API directly.

---

## 6. Authentication

Simple hardcoded email/password gate via `AuthContext.tsx`. No database users, no sessions — purely client-side state. The app renders `<Login />` until authenticated, then renders the main calculator wrapped in `<VoyageProvider>`.

---

## 7. Key Design Decisions

1. **Pure Calculation Engine**: `useVoyageCalculation` is a single `useMemo` — no side effects, fully deterministic. Input changes trigger automatic recalculation.

2. **Dual Speed Profiles**: Every vessel has both Eco and Full Speed consumption matrices. The active profile is selected via `vessel.speedProfile`.

3. **ECA Zone Handling**: Distances are split into ECA and Non-ECA. Fuel type switches automatically (HSFO/VLSFO outside ECA → LSMGO inside ECA).

4. **Port Time = Working Days + Idle**: Loading/discharging days use active fuel rates; turn time and extra time use idle rates.

5. **Sea Margin**: Applied as a percentage multiplier on base sea time (not on port time).
