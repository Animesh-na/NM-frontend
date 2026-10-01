# Current Architecture Audit

Audit date: 2026-10-01

## Scope and working-tree state

This audit covers two sibling repositories supplied in the workspace:

- Frontend: `cozy-crafting-cloud`
- Backend: `Mcs_backend/look-up-service`

No application source code or tests were changed during this audit. Both worktrees already contain uncommitted calculation-related files and edits. They are described as **working-tree additions**, not as committed or deployed architecture:

- Frontend: `src/services/voyageCalculationApi.ts`, `CALCULATION_MIGRATION.md`, and edits to `VoyageContext.tsx` and `useVoyageCalculation.ts`.
- Backend: `internal/voyagecalc/`, `internal/handlers/voyage_calculation_handler.go`, its test, and router/bootstrap wiring.

The committed baseline is a browser-authoritative voyage calculator with a separate Go lookup and sheet service. The working tree additionally contains a Go voyage engine and a stateless HTTP calculation endpoint. The frontend does not call that endpoint anywhere, so it does not participate in the current interactive calculation flow.

## 1. Current architecture

```text
Browser (React/Vite)
  ├─ React Context editing state
  ├─ synchronous TypeScript voyage calculations
  ├─ direct HTTPS calls to the Go Marine API
  └─ explicit save / save-on-leave of complete sheet JSON
             │
             ▼
Go/Gin look-up service
  ├─ JWT authentication and segment access control
  ├─ vessel, port, distance, reference-data and sheet APIs
  ├─ PostgreSQL through GORM
  ├─ Redis cache and IP rate limit counters
  └─ scheduled bunker-price and FX synchronisation

PostgreSQL stores complete sheet JSONB documents; it does not calculate voyage results.
```

There is no RabbitMQ client, worker queue, WebSocket server/client, calculation session, sheet lease, calculation result store, or versioned calculation protocol in the committed code. The Go `internal/voyagecalc` package is uncommitted working-tree code; its HTTP endpoint is synchronous and does not persist results.

## 2. Current frontend architecture

- Framework/build: React 18, TypeScript, Vite 5, SWC React plugin, Tailwind/shadcn UI. `npm run build` runs Vite and `npm test` runs Vitest in jsdom.
- Composition: `src/App.tsx` creates React Query, authentication, sheet, and voyage-context providers. `SheetRouter` mounts a fresh `VoyageProvider` for the active tab. `src/pages/Index.tsx` renders the workbook editor and summary.
- State management: React Context only. `AuthContext` stores the JWT and user in local storage. `SheetContext` owns open tabs, persistence state, and dirty tracking. `VoyageContext` owns vessel, sequence, cargo, bunker, misc, regulatory toggles, and computed `VoyageResults`.
- Local storage: authentication token/user; custom stowage factors; MFA dismissal/skip preferences; Supabase preview auth adapter. No calculation result cache or offline sheet-store was found.
- React Query is provided at app root but does not own voyage calculation state.
- Debounce: no debounce for calculation or input patches was found. Inputs immediately update Context; `useVoyageCalculation` recomputes through `useMemo` when its input object changes.
- WebSocket: no `WebSocket`, Socket.IO, `ws://`, or `wss://` implementation was found.

### Frontend inputs and reference data

- Vessel profiles: `src/data/vessels.ts`, mutable in `VesselPanel`/`ConsumptionMatrix`.
- Port coordinates and fallback routing data: `src/data/ports.ts`, `src/utils/seaRouteDistance.ts`.
- Stowage factors: `src/data/stowageFactors.ts`, with locally persisted custom values.
- Regulatory constants: `src/utils/emissionCalculations.ts`, `src/utils/fuelEuMaritime.ts`, `src/utils/ukEtsCalculations.ts`, and `src/utils/euCountries.ts`.
- Live reference calls: vessel, port, route, bunker price, port DA, exchange rate, and related lookups through `src/services/marineApi.ts` and `src/services/vesselFuelApi.ts`.

## 3. Current backend architecture

- Framework/build: Go 1.24 module, Gin HTTP router, GORM with PostgreSQL/pgx driver. `Makefile` exposes test, vet, build, and run targets. Docker files and `docker-compose.yml` provide deployment configuration.
- Entrypoint: `cmd/api/main.go`. It loads config, opens PostgreSQL and Redis, runs migrations when requested, wires repositories → services → handlers → `internal/routers/router.go`, starts the scheduler, then serves Gin.
- Packages:
  - `internal/handlers`: HTTP decoding/response handling.
  - `internal/services`: application logic for sheets, search, routing, reference data, auth/MFA, cache, and scheduled updates.
  - `internal/repository`: GORM-backed persistence interfaces/implementations.
  - `internal/models`: GORM/domain structures.
  - `internal/middleware`: JWT access control, timing, and Redis-backed rate limiting.
  - `internal/scheduler`: in-process cron jobs for bunker prices and exchange rates.
  - `internal/voyagecalc`: uncommitted calculation package described below.
- PostgreSQL: `internal/database/database.go` uses GORM. It leaves GORM prepared statement caching disabled to avoid stale plans after out-of-band migrations. No application-specific pool sizes are configured; driver defaults apply.
- Redis: `redis/go-redis/v9` is connected at startup. Search caches use JSON values and a five-minute TTL; rate limiting uses `INCR` and `EXPIRE`; port reference data can be pushed through `--sync-redis`/`--sync-ports`. Cache and rate-limit failures are handled as non-fatal/fail-open respectively.
- RabbitMQ: neither imports nor configuration were found.
- Workers: no queue worker package exists. The only background work is an in-process cron scheduler: bunker price sync every 30 minutes and exchange-rate sync twice daily, plus one startup run of each.
- Transactions: no transaction handling was found around sheet create/update. Sheet saves use separate GORM `Create` or `Save` calls.

## 4. Current calculation flow

### Actual user edit flow

1. A user edits a Voyage UI field in a component such as `VesselPanel`, `SequenceTable`, `CargoSection`, `BunkerSection`, or `MiscSection`.
2. The component invokes a setter from `VoyageContext`.
3. `VoyageContext` immediately recalculates derived sequence values through `recalculateDerivedSequenceRows` when relevant inputs change:
   - `calculateSeaTime` selects eco/full matrix speed, splits non-ECA/ECA distances, applies sea margin, and determines per-leg timing.
   - `calculatePortDays` derives port stay from quantity/productivity/terms/turn/extra time, with a tanker laytime branch.
4. `VoyageContext` builds `VoyageInputs`, resolves cargo operation overrides and demurrage/dispatch values, and calls `useVoyageCalculation(voyageInputs)`.
5. `useVoyageCalculation` runs synchronous TypeScript calculation logic inside `useMemo`. It calculates time, fuel, cost, revenue, P&L/TCE, emissions, EU/UK ETS, FuelEU, and breakdowns. Its `VoyageResults` are exposed directly to summary and breakdown components.
6. `Index.tsx` serialises current editable inputs and compares them with a baseline JSON snapshot. It marks the active tab dirty; it does not send a calculation request or receive a calculation response.
7. A save occurs only when the user emits the `sheet-save` browser event or when a dirty tab is left. `SheetContext.autoSaveTab` posts the whole JSON sheet document to the REST API. Browser unload shows the standard before-unload warning rather than performing a reliable background save.
8. The Go sheet handler validates authentication, ownership/workbook access, name, and JSON validity, then writes the JSONB `data` field to PostgreSQL. It does not execute calculation code, cache results, or return calculated values.
9. The frontend replaces the tab's data with the saved payload and clears dirty state. Results remain locally derived from React state.

### Reference data flow that affects calculations

- Vessel selection calls the Go vessel endpoint. `vesselFuelApi.ts` then calculates MCR/SFOC-derived fuel consumption **in the browser** through `computeConsumption`; comments state this moved from a previously used Supabase Edge Function.
- Port selection calls the Go port endpoint, which returns coordinates and EU/UK/ECA-related flags.
- Distance retrieval calls `GET /api/v1/fleetgo/distbl` through `marineApi.ts`; when it fails, `VoyageContext` falls back to the browser `searoute-js` helper. Weather-routing parameters are intentionally disabled in the current client.
- Bunker and exchange-rate API calls populate editable inputs/reference data. Calculation is still local after that data is obtained.

## 5. Calculation inventory

| Calculation | Frontend implementation | Backend implementation | Inputs → outputs / dependencies | Duplicated? | Same result? |
|---|---|---|---|---|---|
| Vessel MCR/SFOC fuel TPD | `services/vesselFuelApi.ts`: `computeConsumption`, `meFuelTpd`, `aeFuelTpd` | No committed Go equivalent. Working tree Go engine consumes matrix values, not raw MCR/SFOC. | Engine data, load constants, scrubber → outside/ECA/port fuel TPD. Vessel API provides raw fields. | No committed duplicate | Not compared |
| Route distance | `services/marineApi.ts`: `getSeaRouteDistance`; `utils/seaRouteDistance.ts`: fallback | `SeaRouteHandler`/`FleetGoHandler` and services call external route providers | Ports/coordinates → total, ECA, non-ECA distance and optional delay/ETA | Client fallback duplicates a routing approximation | Not compared |
| Sea days/speed/sea margin | `VoyageContext.tsx`: `getSpeedForContext`, `calculateSeaTime`, `recalculateDerivedSequenceRows` | Working tree `internal/voyagecalc/calculator/times.go`, `voyage_days.go` | Distance/ECA distance, speed profile/context, cargo-on-board, margin → leg/total days | Yes, working tree only | Go captures test against recorded app outputs; no shared frontend-vs-Go test |
| Port days/terms | `VoyageContext.tsx`: `calculatePortDays`; `utils/demurrageDespatch.ts`: `calculatePortDaysForDemurrage` | Working tree `times.go`, `voyage_days.go` | Quantity, productivity or tanker laytime, terms/coefficient, turn/extra → days | Yes, working tree only | Not proven; UI has richer CP/operational overrides |
| Draft/TPC/loadability | `utils/draftRestriction.ts`: `estimateCubicFromDwt`, `calculateDraftRestriction`; vessel data uses a DWT-based TPC fallback | None found | Draft, DWT, TPC, cubic capacity, port maximum draft, UKC, stowage factor, requested cargo → access/loadability | No | N/A |
| Seasonal DWT | No calculation implementation found; `Season` exists for open-port UI state only | None found | N/A | No | N/A |
| Fuel consumption/breakdown | `useVoyageCalculation.ts`; `utils/fuelBreakdown.ts`: `computeLegSeaFuel`, `computePortFuel`, `splitPortStay` | Working tree `bunker.go`, `voyage_days.go` | Matrix rates, scrubber, ECA, leg/port/canal time, reward factor → HSFO/VLSFO/LSMGO and AE totals | Yes, working tree only | Capture parity exists; no common-input harness |
| Bunker pricing/FIFO | `utils/bunkerPricing.ts`, `utils/fuelBreakdown.ts`: FIFO coverage | Working tree `bunker_pricing.go`, `fifo_coverage.go` | BOB, lots, prices, consumption, mode → effective price/cost | Yes, working tree only | Not proven; frontend suite currently has a FIFO coverage failure |
| Cargo/freight/revenue | `useVoyageCalculation.ts`; `utils/cargoRowMapping.ts` | Working tree `cargo.go`, `cargo_allocation.go`, `profitability.go` | Cargo mappings/rates/quantity/commission → freight/revenue/per-cargo values | Yes, working tree only | Not proven; working-tree README/captures identify allocation limits |
| Demurrage/despatch | `utils/demurrageDespatch.ts`: cargo/row totals; `VoyageContext` supplies CP and operational overrides | Working tree profitability/time calculation accepts aggregate entries only | CP/op days, rates, laytime mode, assignments → amounts/extra days | Partial, working tree only | Not equivalent by model; backend omits several UI override semantics |
| Voyage costs/P&L/TCE | `useVoyageCalculation.ts` | Working tree `profitability.go` | Freight, bunker/port/misc/canal/hire/regulatory costs → P&L, NTCE/GTCE/TCE | Yes, working tree only | Capture parity, but no full UI result comparison |
| CO2/CO2e/EFOI/CII | `utils/emissionCalculations.ts`; hook composes it | Working tree `emissions.go` | Fuel totals, DWT/distance/cargo, constants → CO2, EFOI, CII/rating | Yes, working tree only | Capture parity for selected scenarios only |
| EU ETS | `emissionCalculations.ts`, `euCountries.ts`, hook’s leg logic | Working tree `eu_ets.go`, `regulatory_fuel.go` | Ports, EU flags, leg fuel, EUA price, phase-in → chargeable CO2/cost | Yes, working tree only | Capture parity for selected scenarios only |
| UK ETS | `ukEtsCalculations.ts`, hook’s leg logic | Working tree `uk_ets.go`, `regulatory_fuel.go` | UK flags/zones, fuel, price → chargeable CO2/cost | Yes, working tree only | Capture parity for selected scenarios only |
| FuelEU | `fuelEuMaritime.ts`, hook | Working tree `fuel_eu.go`, `regulatory_fuel.go` | EU-covered fuel, annual limits, fuel properties, FX/reward → penalty | Yes, working tree only | Capture parity for selected scenarios only |

`CALCULATION_REFERENCE.md` documents many frontend formulas. It cites `supabase/functions/vessel-fuel-api/index.ts`, but that function source is not present in the current checkout; the active `vesselFuelApi.ts` says it now performs that calculation in the browser. Documentation that describes Edge Function proxying is therefore historical and does not match current source.

## 6. Current persistence, Redis, PostgreSQL, and messaging

### Sheets and calculations

- Editable sheet state is serialised in `Index.tsx` as a complete JSON document and stored in `dry_bulk_sheets.data` or `tanker_sheets.data` (`jsonb`). Computed `VoyageResults` are not included in the save payload.
- Persisted sheet columns are ID, owner, workbook ID, name, JSON data, status, created timestamp, and updated timestamp. There is no `version`, `working_sequence`, `calculation_id`, `lease_id`, engine version, or snapshot/result table.
- `DryBulkSheetService.SaveSheet` and its tanker counterpart use `repo.Save` for update. There is no `WHERE version = ?`, transaction, compare-and-swap, or conflict response. Last successful writer wins.
- Autosave is present only on tab/view leave and is asynchronous. There is no timer-based autosave and no save acknowledgement beyond the REST response.
- Multiple tabs are supported in local `SheetContext`; they share no lease or server coordination. A second browser/tab can overwrite a saved sheet.

### Redis

- Five-minute JSON cache for vessel and port searches (`internal/services/search_common.go`). Cache misses/failures fall back to database queries.
- IP rate limiting for client logs using `INCR` + `EXPIRE`; Redis failure fails open.
- `RedisSyncService` can populate port lookup data from PostgreSQL under CLI flags.
- No calculation/session/result cache, patch ordering, locking, lease fencing, or sheet state is stored in Redis.

### PostgreSQL and migrations

- PostgreSQL is the authoritative store for users, organizations, sheets/workbooks, vessel/port/reference data, bunker data, logs, and exchange rates.
- Migration SQL lives in `migrations/`; runtime migrations live in `internal/migrations/`; `schema.sql` is a database dump/reference.
- No migration adds sheet-version columns or calculation persistence.

### RabbitMQ and background workers

- No RabbitMQ/AMQP package, configuration, container, publisher, consumer, or worker was found.
- The in-process cron scheduler is the only asynchronous processing. It synchronises reference data, not voyage calculations or sheet persistence.

## 7. Current WebSocket behavior

No WebSocket behavior exists in the inspected frontend or backend. Interactive calculations, sheet saves, and route lookups are HTTP or local synchronous calculations only.

## 8. Current authentication and authorization

- Frontend `AuthContext` persists bearer tokens in local storage; service helpers attach `Authorization: Bearer <token>` and dispatch a session-expired browser event on missing/expired/401 tokens.
- Backend `JWTAuth` validates HS256 JWTs, rejects MFA challenge tokens, reloads the user from PostgreSQL, checks active/expiry status, and places user ID, role, organization ID, and dry-bulk/tanker access flags in Gin context.
- Router groups require JWT; segment routes additionally require the matching entitlement. Sheet services enforce owner/admin access and permit organization-mate read-only access.
- The browser currently carries the Marine API key in `src/services/apiConfig.ts`; this is a security concern separate from the calculation migration.

## 9. Existing API surface relevant to voyage work

The actual route definitions are in `internal/routers/router.go`.

| Area | Endpoints |
|---|---|
| General authenticated data | `GET /api/v1/searoute`, `GET /api/v1/fleetgo/distbl`, bunker-price endpoints, exchange-rate endpoint, company lookup |
| Dry bulk | vessel type/search/sector, port search/DA, fixture/cargo/flow/orderbook/valuation reads, workbook CRUD, sheet create/list/get/archive/restore, organization-sheet reads |
| Tanker | parallel tanker vessel/port, fixture/cargo/flow/orderbook/valuation, workbook and sheet endpoints |
| Auth and administration | sign-in/token validation/MFA, user/org/admin routes, cache routes, client-log ingestion |
| Working-tree calculation addition | `POST /api/v1/calculations/voyage`, JWT-protected, synchronous and stateless; frontend has no caller |

## 10. Tests and current coverage

### Frontend

- Vitest unit tests cover vessel, sequence, bunker, cargo, misc, emissions, validation, routing and draft restriction.
- Integration tests: `src/test/integration/voyageCalculation.test.ts` and `voyageSummaryReport.test.ts` cover the browser hook/output.
- Smoke tests exercise broad calculation invariants and CORS assumptions.
- No browser end-to-end test, WebSocket test, backend-contract test, or frontend-vs-Go parity test was found.

### Backend

- Unit/service tests cover auth/JWT, MFA, authorization, sheet/workbook services, routing, reference services, cache-adjacent behavior, and client logs.
- Shell scripts `test_api.sh` and `test_admin_sheets.sh` provide manual/integration API checks.
- The uncommitted engine includes calculator unit tests and scenario/capture parity tests. `app_results_test.go` compares selected Go results with recorded reference-app JSON captures; this is useful evidence but does not execute the current React hook or prove all UI paths are equivalent.
- There are no tests for sessions, leased writers, resume/reconnect, version conflicts, stale calculations, RabbitMQ, persistence workers, or database failures because those features do not exist.

## 11. Risks

1. The source of truth is split within the browser itself: `VoyageContext`, `useVoyageCalculation`, `fuelBreakdown`, `demurrageDespatch`, `excelExport`, and `vesselFuelApi` repeat or re-derive related formulas.
2. The Go engine is present only as uncommitted working-tree code. Treating it as deployed authority would be inaccurate.
3. Existing Go capture tests establish selected recorded-output parity but do not cover all frontend-only semantics: CP/operational cargo overrides, tanker laytime detail, draft feasibility, TPC estimation, browser fallback routing, and full breakdown/result contract.
4. Full JSONB replacement without optimistic concurrency permits lost updates between tabs or users.
5. Browser calculation constants are mutable source code and several regulatory/reference rules have no explicit version pinned to persisted calculations.
6. API/deployment documentation still references Supabase Edge Functions that are absent from the checkout; it should not be used as a runtime architecture source without validation.
7. The frontend includes a browser-visible API key.

## 12. Migration recommendations

1. Preserve current TypeScript results as the behavioral baseline. Build a common set of serialized voyage inputs and golden expected outputs before changing authority.
2. Bring the Go engine into a committed, reviewed package with a typed adapter that represents every currently supported input/override and full required result contract.
3. Write parity tests that invoke both implementations with the same fixtures. Keep frontend and backend paths available until all agreed domains pass, and record intentional differences as test cases.
4. Define persistence concurrency first: a persisted version on sheets, conditional updates, explicit conflict responses, and a calculation snapshot schema. Do not add a distributed lease without a defined session/ownership lifecycle.
5. Add WebSocket transport only after the calculation request/result contract is stable. It should include authenticated connect, field allowlist, sequence, calculation ID, resume, stale-result rejection, and truthful save state.
6. Make reference data and engine versions explicit in calculation inputs/results. Decide which regulatory constants are database/reference-data owned and add auditability for changes.
7. Move draft/TPC/seasonal-DWT only after their intended rules and golden examples are identified; no backend equivalent currently exists.

## 13. Files likely to change in a future migration

- Frontend: `src/context/VoyageContext.tsx`, `src/hooks/useVoyageCalculation.ts`, `src/utils/{fuelBreakdown,bunkerPricing,emissionCalculations,fuelEuMaritime,ukEtsCalculations,demurrageDespatch,draftRestriction}.ts`, `src/services/{marineApi,vesselFuelApi}.ts`, `src/context/SheetContext.tsx`, and the calculation summary/breakdown components.
- Backend: `cmd/api/main.go`, `internal/routers/router.go`, new calculation/session/transport packages, sheet models/repositories/services/handlers, Redis coordination, migrations, and deployment configuration.
- Tests: browser unit/integration fixtures, backend golden/parity fixtures, API contract tests, persistence/concurrency tests, and WebSocket/failure tests.

## Audit conclusion

**AUDIT COMPLETE**

The active application calculates voyages synchronously in React/TypeScript. The Go service currently provides authenticated lookup, routing, reference data, sheet persistence, PostgreSQL, Redis caching, and scheduled reference-data refreshes; it does not take part in live voyage calculation or result persistence. A substantial Go calculation engine and endpoint exist only as uncommitted additions and are not yet connected to the frontend. There is no WebSocket, RabbitMQ, calculation worker, lease, or sheet versioning implementation to preserve during migration.
