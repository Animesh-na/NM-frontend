# Voyage Calculation Migration Audit

## Current architecture

- Frontend: Vite, React, and TypeScript. `VoyageProvider` owns editable vessel, sequence, cargo, bunker, and miscellaneous inputs. `SheetProvider` owns tabs and calls the existing sheet REST API.
- Backend: a separate Go/Gin service in `Mcs_backend/look-up-service`. It provides authenticated vessel/port/search and sheet APIs, uses PostgreSQL via GORM, and uses Redis for lookup caching/rate limiting. It has no voyage calculation package, WebSocket session manager, RabbitMQ integration, lease protocol, or calculation version model today.
- Supplied engine: `engine.zip` contains a standalone Go module with calculation modules and recorded app-result fixtures. Its reference fixtures and tests indicate it was ported from the existing frontend rules. `README.md` explicitly records source gaps around consumption fallbacks, per-cargo allocation, and FIFO coverage.

## Calculation inventory

| Calculation | Current frontend location | Current backend location | Current authority / inputs / outputs | Known differences and migration status |
|---|---|---|---|---|
| Voyage orchestration | `src/hooks/useVoyageCalculation.ts` (`useMemo`, ~2,041 lines); invoked by `src/context/VoyageContext.tsx` | Supplied `engine/calculator/voyage.go` | Frontend currently authoritative in the live UI; Go engine produces `models.VoyageResults` from `models.VoyageInputs` | Engine has recorded capture parity tests, but is not yet called by the running UI. |
| Routing / distance | `src/context/VoyageContext.tsx` (`recalculateDistances`); `src/utils/seaRouteDistance.ts`; API client in `src/services/marineApi.ts` | Existing Go `/api/v1/searoute`, FleetGo distance handlers/services | Route distance, ECA split, optionally ETA/delay -> sequence rows | Backend already has route APIs; client also has local route fallback. Distance retrieval is separate from proprietary voyage calculation. |
| Distance and sea days | `VoyageContext.tsx` (`calculateSeaTime`, `recalculateDerivedSequenceRows`); engine `calculator/voyage_days.go` | Supplied engine `calculator/voyage_days.go` | Distance, ECA distance, speed profiles/contexts, margin -> per-leg and total time | Engine derives time from distance and speed. Frontend precomputes and passes times into the hook. Compare mixed contexts/sea-margin edge cases before removing frontend derivation. |
| Port days / terms | `VoyageContext.tsx` (`calculatePortDays`); `utils/demurrageDespatch.ts` | Supplied engine `calculator/voyage_days.go` | Quantity, productivity or tanker laytime, terms, turn/extra time -> port days | Frontend contains separate CP/operational values and tanker-specific behavior; engine input model does not include every UI override. |
| Speed / fuel matrix | `src/data/vessels.ts`, `src/components/voyage/ConsumptionMatrix.tsx`, `utils/speedContext.ts` | Supplied engine `models/models.go`, `calculator/bunker.go` | Vessel profiles, speed contexts, scrubber, fuel rates -> speeds and consumption | These files include inputs/display behavior as well as formulas; keep profile editing and formatting in UI. Engine README documents zero-fuel behavior if speed profile is missing. |
| Fuel / bunker consumption | `useVoyageCalculation.ts`; `utils/fuelBreakdown.ts` | Supplied engine `calculator/bunker.go`, `calculator/fifo_coverage.go` | Sea/port/canal days, fuel profile, ECA, scrubber, rewards, port lots -> fuel totals/breakdowns | Engine README lists fallback and FIFO-coverage gaps. Do not remove frontend formula until those cases are reconciled. |
| Bunker price / cost | `useVoyageCalculation.ts`; `utils/bunkerPricing.ts`, `utils/fuelBreakdown.ts` | Supplied engine `calculator/bunker_pricing.go` | Prices, opening ROB, port bunkering lots and fuel mode -> effective prices and bunker cost | Parity fixtures cover selected FIFO scenarios; broader existing tests should be run against Go output. |
| Cargo / freight | `useVoyageCalculation.ts`; cargo state/validation/mapping in `VoyageContext.tsx`, `utils/cargoRowMapping.ts`, `utils/cargoValidation.ts` | Supplied engine `calculator/cargo.go`, `calculator/cargo_allocation.go` | Cargo assignments, quantities, rates, commissions -> revenue and cargo breakdown | Engine README identifies per-cargo allocation gaps. UI has CP and operational overrides not all represented in engine inputs. |
| Draft / TPC / seasonal DWT | `src/utils/draftRestriction.ts`; vessel and sequence UI components | No identified implementation in supplied engine or live Go service | DWT, TPC, cubic capacity, port limit, UKC, stowage factor, requested cargo -> loadability/draft result | Remains frontend-only. The prompt lists seasonal DWT, but no matching implementation was found in the audited source paths. Requires an explicit domain model and golden cases before moving. |
| CO2 / CO2e / EFOI / CII | `src/utils/emissionCalculations.ts`, `useVoyageCalculation.ts` | Supplied engine `calculator/emissions.go` | Fuel totals/factors, DWT, distance, cargo -> emissions, EFOI, CII/rating | Engine includes recorded captures; regulatory constants in frontend utility and engine `constants.go` require versioned comparison. |
| EU ETS | `src/utils/emissionCalculations.ts`, `useVoyageCalculation.ts`, `src/utils/euCountries.ts` | Supplied engine `calculator/eu_ets.go`, `regulatory_fuel.go` | Fuel by segment, EU port flags, price and phase-in -> chargeable CO2/cost | Captures exercise common coverage cases; confirm port classification/reference data provenance and annual constants. |
| UK ETS | `src/utils/ukEtsCalculations.ts`, `useVoyageCalculation.ts` | Supplied engine `calculator/uk_ets.go`, `regulatory_fuel.go` | Fuel by segment, UK zone flags, price/phase-in -> chargeable CO2/cost | Keep UK zone reference inputs consistent; verify NI/GB boundary fixtures. |
| FuelEU | `src/utils/fuelEuMaritime.ts`, `useVoyageCalculation.ts` | Supplied engine `calculator/fuel_eu.go`, `regulatory_fuel.go` | EU-covered fuel, year, factors, wind reward -> intensity and penalty | Both sides have formulas; supplied engine README describes its per-fuel behavior. Validate constants, FX and charge toggle against current UI. |
| Demurrage / dispatch | `src/utils/demurrageDespatch.ts`; aggregation and override handling in `VoyageContext.tsx` | Supplied engine `calculator/voyage_days.go`, `calculator/profitability.go`, cargo models | CP vs operational port days, rates, settlement mode -> extra days and money | Engine input omits detailed row overrides/laytime modes represented by UI. Not safe to remove yet. |
| Revenue, costs, P&L, TCE | `useVoyageCalculation.ts` | Supplied engine `calculator/profitability.go` | Freight, commission, bunker/port/misc/canal/hire/regulatory costs -> profitability | Captured panel values cover a subset; result presentation consumes more fields than the Go compact app result. |

## APIs, persistence, state, and infrastructure

- Existing calculation API: none. Existing authenticated APIs provide searoute, FleetGo distance, bunker prices, exchange rates, and sheet CRUD.
- Persistence: sheet JSON is stored in `dry_bulk_sheets` and `tanker_sheets` (PostgreSQL JSONB). Frontend edits local context and saves through sheet REST calls; saves have no calculation snapshot acknowledgement/version contract.
- Redis: lookup cache and IP rate-limit counters. No sheet lease/session ownership, result cache, or calculation coordination found.
- RabbitMQ: none found in the Go service or frontend.
- Authentication: Go Gin JWT middleware validates bearer tokens, reloads active user and sets user/org/access context. Frontend stores and sends bearer tokens through the existing API client.
- Frontend state: React Context (`VoyageContext`, `SheetContext`), with component-local state in UI. No Redux/Zustand and no WebSocket client found.
- Database concurrency: sheet models have no version field; current sheet saves do not implement the prompt's compare-and-swap version update.

## Duplicated formulas and known differences

- The live TypeScript hook owns the full synchronous calculation result, including voyage times, fuel, financials, emissions, EU/UK ETS, and FuelEU. The Go engine independently implements most of those domains and includes reference capture tests.
- `VoyageContext.tsx` independently derives sea time and port time before calling the calculation hook. `demurrageDespatch.ts` computes CP/operational port time separately. These are formula duplications with extra UI-specific override semantics.
- `draftRestriction.ts` has draft/volume/DWT feasibility formulas with no identified Go equivalent. Seasonal DWT/TPC has no clearly identified reusable calculation in the current Go service.
- The supplied Go engine's own README names unresolved parity gaps for fallback consumption, per-cargo allocation, and FIFO coverage. The live frontend has additional operational overrides and result breakdowns that do not fit its compact app summary.
- Therefore the Go engine is a strong migration source, but it is not yet proven equivalent for every live input/result path. Keep current formulas until each domain has a mapped request/result contract and captured parity coverage.

## Migration risks

1. The UI and tests depend on a synchronous `VoyageResults` shape with detailed per-leg and per-fuel results; the engine's panel projection is intentionally compact.
2. Voyage timing feeds the editable sequence and ETA behavior, so moving it requires separating authoritative results from local editing/display state.
3. CP/operational cargo overrides, tanker laytime, and per-cargo allocation are richer in the frontend than in the engine input model.
4. Calculation inputs contain regulatory/reference values. Their source and version must be explicit for deterministic results.
5. Existing REST sheet saves lack persisted versions. A correct single-writer lease, fencing, resume, and save acknowledgement requires DB schema and Redis/session design beyond a stateless calculation endpoint.
6. The backend currently has no WebSocket origin/auth/resume protocol, RabbitMQ, persistence worker, tracing IDs, or engine version metadata.

## Proposed migration sequence and status

1. **Audit:** completed in this document; no existing business formulas were removed.
2. **Backend engine:** integrate the supplied Go package and expose an authenticated stateless calculation endpoint. Preserve its reference capture suite; do not represent missing domains as migrated.
3. **Frontend adapter:** add a typed client and request/result contract; next step is a parity adapter for the live context result shape.
4. **WebSocket and session protocol:** follow after the engine adapter and identity/tenant contract are agreed with existing sheet persistence. Add lease epoch, version, sequence, calculation ID, resume, heartbeat, and stale-result rejection together.
5. **Formula removal:** remove TS authoritative domains only after old-vs-Go golden cases pass, including the UI override and fallback cases.
6. **Persistence and reliability:** implement DB optimistic concurrency and save acknowledgement; add Redis leases and outbox/worker only with deployment/runtime configuration. RabbitMQ is not currently provisioned in this service.
7. **Failure/concurrency verification:** cover reconnect, worker/API failure, stale calculations, tenant access, and persistence faults before declaring migration complete.

### First implementation slice (implemented)

- The supplied engine's `calculator`, `models`, `inputs`, and reference scenarios/captures are now under `look-up-service/internal/voyagecalc/`; its Go imports use the service module path.
- `POST /api/v1/calculations/voyage` runs under the service's existing JWT middleware, caps request bodies at 2 MiB, rejects unknown JSON fields, and returns calculation ID, client sequence, engine version, status, and the engine's captured-summary projection.
- `src/services/voyageCalculationApi.ts` defines a typed transport and explicitly projects UI inputs onto the Go engine schema. The context now carries raw productivity/terms/coefficient inputs needed by the engine.
- New Go handler tests check a recorded voyage calculation and reject unknown input fields.
- The live synchronous calculation hook remains the UI authority for now. The new API is not yet called by `VoyageProvider`; the summary projection is not the complete legacy result contract.

### Verification

- `go test ./...` in `look-up-service`: passed, including the imported engine capture tests and the new API handler tests.
- `go vet ./internal/handlers ./internal/voyagecalc/...`: passed.
- `npm run build`: passed; Vite reports the existing large-bundle warning.
- `npx tsc --noEmit -p tsconfig.app.json`: passed.
- `npm test`: 163 passed, 103 skipped, 2 failed tests, and 3 failed test files. The failures are in existing paths outside this adapter: the external vessel-fuel API test receives a non-OK response; bunker FIFO coverage expects 12.4 but receives 15; and the weather-routing API test expects parameters that `marineApi.ts` currently comments out as disabled. These were left unchanged to avoid altering business behavior during this engine integration slice.

### Remaining migration work

No full migration success criteria are claimed. The interactive UI still computes authoritative values locally. The Go summary contract must be expanded and reconciled with UI-specific inputs (notably cargo override/laytime and per-cargo breakdowns), then the UI can switch to backend results behind parity coverage. WebSocket PATCH/resume, single-writer lease/fencing, persisted-version CAS, stale-result cancellation, save acknowledgements, Redis session coordination, RabbitMQ/outbox persistence, tenant-scoped sheet access, and failure/concurrency tests are not implemented. Draft/TPC/seasonal-DWT logic also has no Go equivalent identified in the supplied engine.
