// Marine API Service - calls upstream Marine API DIRECTLY (no Supabase proxy).
// ⚠️ Requires upstream CORS allow-listing of every browser origin this app runs on.
import { dispatchSessionExpired, getStoredAuthToken } from "@/utils/authToken";
import { buildMarineUrl, marineHeaders } from "./apiConfig";
import { modePath } from "./apiMode";
import { logger } from "@/services/logger";

// Types
export interface VesselType {
  id: number;
  name: string;
}

export interface MarineVessel {
  id: number;
  name: string;
  type: string;
  imo: string;
  builtyear: number;
  builder: string;
  buildercountry: string;
  dwt: number;
  capacitycuft: number;
  owner: string;
  gt: number;
  loa: number;
  draught: number;
  beam: number;
  classificationsociety: string;
  companynationality: string;
}

export interface MarinePort {
  id: number;
  port_code?: string;
  port_name: string;
  country: string;
  latitude: number;
  longitude: number;
  is_eu_eea?: boolean;
  eca_zone?: boolean;
  /** Official EU ETS flag from port API. Preferred over is_eu_eea/country lookups. */
  eu_zone?: boolean;
  uk_ets?: boolean;
  uk_zone?: "gb" | "ni" | null;
  source_table?: string;
}

// Helper for direct API requests to the upstream Marine API
export async function apiRequest<T>(
  endpoint: string,
  params?: Record<string, string | number>,
  options?: { method?: string; body?: unknown; authenticated?: boolean }
): Promise<T> {
  const extraHeaders: Record<string, string> = {};

  if (options?.authenticated !== false) {
    const token = getStoredAuthToken();
    if (!token) {
      dispatchSessionExpired();
      throw new Error("Session expired");
    }
    extraHeaders["Authorization"] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = {
    method: options?.method || "GET",
    headers: marineHeaders(extraHeaders),
  };

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildMarineUrl(endpoint, params), fetchOptions);

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      dispatchSessionExpired();
    }
    let detail = "";
    try {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string; message?: string; detail?: string };
          detail = parsed.error || parsed.message || parsed.detail || text;
        } catch {
          detail = text;
        }
      }
    } catch {
      /* ignore body read failures */
    }
    throw new Error(
      `API Error: ${response.status} ${response.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ""}`
    );
  }

  return response.json();
}

// 1. Get Vessel Types
export async function getVesselTypes(): Promise<VesselType[]> {
  try {
    const data = await apiRequest<{ types: VesselType[] }>(modePath("/vessel-types"), undefined, { authenticated: true });
    return data.types || [];
  } catch (error) {
    console.error("Failed to fetch vessel types:", error);
    return [];
  }
}

// 2. Search Vessels
export async function searchVessels(
  query: string,
  typeId?: number,
  limit: number = 10
): Promise<MarineVessel[]> {
  try {
    const params: Record<string, string | number> = { q: query, limit };
    if (typeId) {
      params.type_id = typeId;
    }
    const data = await apiRequest<{ vessels?: MarineVessel[]; results?: MarineVessel[] }>(
      modePath("/vessels"),
      params,
      { authenticated: true }
    );
    return data.vessels || data.results || [];
  } catch (error) {
    console.error("Failed to search vessels:", error);
    return [];
  }
}

// 3. Search Ports
export async function searchPorts(query: string, limit: number = 10): Promise<MarinePort[]> {
  try {
    const data = await apiRequest<{ ports: MarinePort[] }>(modePath("/ports/search"), { q: query, limit }, { authenticated: true });
    return data.ports || [];
  } catch (error) {
    console.error("Failed to search ports:", error);
    return [];
  }
}

// 4. Sea Route Distance Calculation
export interface SeaRouteResponse {
  total_distance_nm: number;
  eca_distance_nm: number;
  non_eca_distance_nm: number;
}

export async function getSeaRouteDistance(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  originPortCode?: string,
  destPortCode?: string,
  vesselSpeed?: number,
  departureUtc?: string
): Promise<SeaRouteResponse & { delayHours?: number; eta?: string }> {
  logger.info("Sea route distance requested", {
    component: "marineApi.getSeaRouteDistance",
    origin: originPortCode ?? `${originLat},${originLon}`,
    dest: destPortCode ?? `${destLat},${destLon}`,
    vessel_speed: vesselSpeed,
    weather_routing: !!(vesselSpeed && departureUtc),
  });
  // Build the ports parameter: use valid port codes if available, otherwise lat,lon format
  // Valid codes: from port search API, formatted as country+code (e.g. EGGUOS, EGSUZ, ZARCB)
  // Invalid: "NaN", empty, fallback "PORT-*"/"COORD-*", or legacy sea-ports short codes (<=4 chars)
  const isValidCode = (code?: string) =>
    !!code &&
    code !== "NaN" &&
    !code.startsWith("PORT-") &&
    !code.startsWith("COORD-") &&
    code.length >= 5; // Port search API codes are 5+ chars (country prefix + port)

  const bothValid = isValidCode(originPortCode) && isValidCode(destPortCode);

  const latLonOrigin = `:${originLat},${originLon}`;
  const latLonDest = `:${destLat},${destLon}`;

  // Build extra params for weather routing
  const extraParams: Record<string, string | number> = {};
  // API requires both vessel_speed AND departure_utc together — send neither if one is missing
  if (vesselSpeed && vesselSpeed > 0 && departureUtc) {
    extraParams.vessel_speed = vesselSpeed;
    // API expects "YYYY-MM-DD HH:mm" format; HTML datetime-local gives "YYYY-MM-DDTHH:mm"
    extraParams.departure_utc = departureUtc.replace("T", " ");
  }

  // Try port codes first if both look valid, fall back to lat/lon on failure
  if (bothValid) {
    try {
      const data = await apiRequest<{
        total_distance: number;
        eca_distance: number;
        non_eca_distance: number;
        delayHours?: number[];
        totalDelayHours?: number;
        ETA?: string[];
      }>("/fleetgo/distbl", { ports: `${originPortCode}_${destPortCode}`, ...extraParams }, { authenticated: true });
      return {
        total_distance_nm: data.total_distance ?? 0,
        eca_distance_nm: data.eca_distance ?? 0,
        non_eca_distance_nm: data.non_eca_distance ?? 0,
        delayHours: data.totalDelayHours ?? (data.delayHours?.[0] ?? undefined),
        eta: data.ETA?.[0] ?? undefined,
      };
    } catch {
      // Port codes rejected — fall through to lat/lon
      console.warn(`Port codes ${originPortCode}_${destPortCode} rejected, falling back to lat/lon`);
    }
  }

  // Use lat/lon format (always works)
  const data = await apiRequest<{
    total_distance: number;
    eca_distance: number;
    non_eca_distance: number;
    delayHours?: number[];
    totalDelayHours?: number;
    ETA?: string[];
  }>("/fleetgo/distbl", { ports: `${latLonOrigin}_${latLonDest}`, ...extraParams }, { authenticated: true });

  return {
    total_distance_nm: data.total_distance ?? 0,
    eca_distance_nm: data.eca_distance ?? 0,
    non_eca_distance_nm: data.non_eca_distance ?? 0,
    delayHours: data.totalDelayHours ?? (data.delayHours?.[0] ?? undefined),
    eta: data.ETA?.[0] ?? undefined,
  };
}

// ============= Sheet Management APIs (Authenticated) =============

export interface SheetListItem {
  id: string;
  name: string;
  updated_at: string;
  created_at: string;
  owner_email?: string;
}

export interface SheetListResponse {
  sheets: SheetListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface SheetDetail {
  id: string;
  name: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// 5. List all sheets with pagination
export async function listSheets(page: number = 1, limit: number = 10): Promise<SheetListResponse> {
  try {
    const data = await apiRequest<SheetListResponse>(modePath("/sheets"), { page, limit }, { authenticated: true });
    return data;
  } catch (error) {
    console.error("Failed to list sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

// 5b. List organization sheets (read-only view of other users' sheets in the org)
export async function listOrganizationSheets(page: number = 1, limit: number = 10): Promise<SheetListResponse> {
  try {
    const data = await apiRequest<SheetListResponse>(modePath("/organization/sheets"), { page, limit }, { authenticated: true });
    return data;
  } catch (error) {
    console.error("Failed to list organization sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

// 5c. List organization users
export interface OrganizationUser {
  id: string | number;
  email: string;
  name?: string;
  role?: string;
  sheet_count?: number;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
  dry_bulk_access?: boolean;
  tanker_access?: boolean;
}

export interface OrganizationUsersResponse {
  users: OrganizationUser[];
  organizationName?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export async function listOrganizationUsers(page: number = 1, limit: number = 50): Promise<OrganizationUsersResponse> {
  try {
    const data = await apiRequest<OrganizationUsersResponse & { organization?: { name?: string; users?: OrganizationUser[] } }>(
      "/organization/users",
      { page, limit },
      { authenticated: true }
    );
    const users = data.users || data.organization?.users || [];
    return { users, organizationName: data.organization?.name, pagination: data.pagination };
  } catch (error) {
    console.error("Failed to list organization users:", error);
    return { users: [] };
  }
}

// 5d. List sheets owned by a specific organization user
export async function listUserSheets(userId: string | number, page: number = 1, limit: number = 50): Promise<SheetListResponse> {
  try {
    const data = await apiRequest<SheetListResponse>(modePath(`/organization/users/${userId}/sheets`), { page, limit }, { authenticated: true });
    return data;
  } catch (error) {
    console.error("Failed to list user sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

// 6. Save (create) a new sheet
export async function saveSheet(name: string, sheetData: Record<string, unknown>): Promise<SheetDetail | null> {
  try {
    const data = await apiRequest<{ sheet: SheetDetail }>(modePath("/sheets"), undefined, {
      method: 'POST',
      body: { name, data: sheetData },
      authenticated: true,
    });
    return data.sheet || null;
  } catch (error) {
    console.error("Failed to save sheet:", error);
    return null;
  }
}

// 7. Update an existing sheet
export async function updateSheet(id: string, name: string, sheetData: Record<string, unknown>): Promise<SheetDetail | null> {
  try {
    const data = await apiRequest<{ sheet: SheetDetail }>(modePath("/sheets"), undefined, {
      method: 'POST',
      body: { id, name, data: sheetData },
      authenticated: true,
    });
    return data.sheet || null;
  } catch (error) {
    console.error("Failed to update sheet:", error);
    return null;
  }
}

// 8. Get a single sheet by ID
export async function getSheet(id: string): Promise<SheetDetail | null> {
  try {
    const data = await apiRequest<{ sheet: SheetDetail }>(modePath(`/sheets/${id}`), undefined, { authenticated: true });
    return data.sheet || null;
  } catch (error) {
    console.error("Failed to get sheet:", error);
    return null;
  }
}

// 9. Delete a sheet by ID
export async function deleteSheet(id: string): Promise<boolean> {
  try {
    await apiRequest<{ message: string }>(modePath(`/sheets/${id}`), undefined, {
      method: 'DELETE',
      authenticated: true,
    });
    return true;
  } catch (error) {
    console.error("Failed to delete sheet:", error);
    return false;
  }
}

// 10. Search sheets by query
export async function searchSheets(query: string, page: number = 1, limit: number = 10): Promise<SheetListResponse> {
  try {
    return await apiRequest<SheetListResponse>(modePath("/sheets/search"), { q: query, page, limit }, { authenticated: true });
  } catch (error) {
    console.error("Failed to search sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

// ============= Workbooks (collection of sheets) =============

export interface WorkbookItem {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  owner_email?: string;
  sheet_count?: number;
  segment?: string;
}

export interface WorkbookListResponse {
  workbooks: WorkbookItem[];
  pagination: { total: number; page: number; limit: number; total_pages: number };
}

export interface WorkbookSheetItem extends SheetListItem {
  workbook_id?: string;
  user_id?: string;
  data?: Record<string, unknown>;
}

export interface WorkbookSheetsResponse {
  sheets: WorkbookSheetItem[];
  pagination: { total: number; page: number; limit: number; total_pages: number };
}

// List workbooks (mode-scoped, e.g. /dry-bulk/workbooks)
export async function listWorkbooks(page: number = 1, limit: number = 10): Promise<WorkbookListResponse> {
  try {
    return await apiRequest<WorkbookListResponse>(modePath("/workbooks"), { page, limit }, { authenticated: true });
  } catch (error) {
    console.error("Failed to list workbooks:", error);
    return { workbooks: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

// List sheets inside a workbook (full sheet payload incl. data)
export async function listWorkbookSheets(workbookId: string, page: number = 1, limit: number = 50): Promise<WorkbookSheetsResponse> {
  try {
    return await apiRequest<WorkbookSheetsResponse>(
      modePath(`/workbooks/${workbookId}/sheets`),
      { page, limit },
      { authenticated: true }
    );
  } catch (error) {
    console.error("Failed to list workbook sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}


// ============= Fixtures / Cargoes (Authenticated) =============

export type CargoFixture = Record<string, unknown> & { id?: string | number };
export type FixtureRecord = CargoFixture;

export interface CargoListResponse {
  cargoes: CargoFixture[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

// 11. List cargo fixtures (mode-scoped, e.g. /dry-bulk/cargoes)
export async function listCargoes(page: number = 1, limit: number = 20, query?: string): Promise<CargoListResponse> {
  const params: Record<string, string | number> = { page, limit };
  if (query && query.trim()) params.q = query.trim();
  const data = await apiRequest<Partial<CargoListResponse> & { data?: CargoFixture[]; results?: CargoFixture[]; total?: number }>(
    modePath("/cargoes"),
    params,
    { authenticated: true }
  );
  const cargoes = data.cargoes || data.data || data.results || [];
  return {
    cargoes,
    pagination: data.pagination ?? {
      total: data.total ?? cargoes.length,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil((data.total ?? cargoes.length) / limit)),
    },
  };
}

// 12. List fixtures (mode-scoped, e.g. /dry-bulk/fixtures or /tanker/fixtures)
export async function listFixtures(page: number = 1, limit: number = 20, query?: string): Promise<CargoListResponse> {
  const params: Record<string, string | number> = { page, limit };
  if (query && query.trim()) params.q = query.trim();
  const data = await apiRequest<
    Partial<CargoListResponse> & { fixtures?: FixtureRecord[]; data?: FixtureRecord[]; results?: FixtureRecord[]; total?: number }
  >(modePath("/fixtures"), params, { authenticated: true });
  const rows = data.fixtures || data.data || data.results || data.cargoes || [];
  return {
    cargoes: rows,
    pagination: data.pagination ?? {
      total: data.total ?? rows.length,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil((data.total ?? rows.length) / limit)),
    },
  };
}

// 12b. List trade flows (mode-scoped, e.g. /dry-bulk/flows)
export async function listReceivedFixtures(
  page: number = 1,
  limit: number = 20,
  filters: { cargo_status?: string; account?: string; broker?: string; type?: string; cargo_type?: string } = {}
): Promise<CargoListResponse> {
  const params: Record<string, string | number> = { page, limit };
  for (const [k, v] of Object.entries(filters)) if (v && v.trim()) params[k] = v.trim();
  const data = await apiRequest<Record<string, unknown>>(modePath("/received-fixtures"), params, { authenticated: true });
  let rows: CargoFixture[] = [];
  for (const key of ["received_fixtures", "fixtures", "data", "results", "rows", "items"]) {
    const v = data[key];
    if (Array.isArray(v)) { rows = v as CargoFixture[]; break; }
  }
  if (!rows.length) {
    const firstArray = Object.values(data).find((v) => Array.isArray(v));
    if (Array.isArray(firstArray)) rows = firstArray as CargoFixture[];
  }
  const pagination = (data.pagination as CargoListResponse["pagination"]) ?? {
    total: rows.length, page, limit, total_pages: Math.max(1, Math.ceil(rows.length / limit)),
  };
  return { cargoes: rows, pagination };
}

export interface FlowsResponse {
  rows: CargoFixture[];
  pagination: { total: number; page: number; limit: number; total_pages: number };
}

export async function listFlows(
  page: number = 1,
  limit: number = 20,
  filters: { cargo_status?: string; account?: string; broker?: string; type?: string; cargo_type?: string } = {}
): Promise<FlowsResponse> {
  const params: Record<string, string | number> = { page, limit };
  for (const [k, v] of Object.entries(filters)) if (v && v.trim()) params[k] = v.trim();
  const data = await apiRequest<Record<string, unknown>>(modePath("/flows"), params, { authenticated: true });
  let rows: CargoFixture[] = [];
  for (const key of ["flows", "data", "results", "rows", "records", "items"]) {
    const v = data[key];
    if (Array.isArray(v)) { rows = v as CargoFixture[]; break; }
  }
  if (!rows.length) {
    const firstArray = Object.values(data).find((v) => Array.isArray(v));
    if (Array.isArray(firstArray)) rows = firstArray as CargoFixture[];
  }
  const pg = (data.pagination as FlowsResponse["pagination"]) ?? {
    total: rows.length, page, limit, total_pages: Math.max(1, Math.ceil(rows.length / limit)),
  };
  return { rows, pagination: pg };
}

// ============= S&P / Orderbook (Authenticated) =============

export type OrderbookEndpoint =
  | "fleet_in_service"
  | "orderbook_scheduled_deliveries"
  | "orderbook_demolitions"
  | "valuations";

export interface OrderbookResponse {
  rows: CargoFixture[];
  pagination: { total: number; page: number; limit: number; total_pages: number };
}

// 13. Generic orderbook / S&P list (mode-scoped, e.g. /dry-bulk/orderbook/valuations)
export async function listOrderbook(
  endpoint: OrderbookEndpoint,
  page: number = 1,
  limit: number = 20,
  query?: string
): Promise<OrderbookResponse> {
  const params: Record<string, string | number> = { page, limit };
  if (query && query.trim()) params.q = query.trim();
  const data = await apiRequest<Record<string, unknown>>(
    modePath(`/orderbook/${endpoint}`),
    params,
    { authenticated: true }
  );

  // Response arrays can arrive under several keys depending on the endpoint.
  const candidateKeys = [
    "data", "results", "rows", "records", "items",
    endpoint, "fleet", "vessels", "deliveries", "demolitions", "valuations",
  ];
  let rows: CargoFixture[] = [];
  for (const key of candidateKeys) {
    const v = data[key];
    if (Array.isArray(v)) { rows = v as CargoFixture[]; break; }
  }
  if (!rows.length) {
    const firstArray = Object.values(data).find((v) => Array.isArray(v));
    if (Array.isArray(firstArray)) rows = firstArray as CargoFixture[];
  }

  const pagination = (data.pagination as OrderbookResponse["pagination"] | undefined) ?? undefined;
  const total = pagination?.total ?? (typeof data.total === "number" ? data.total : rows.length);
  return {
    rows,
    pagination: pagination ?? {
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

// ============= Bunker Prices (Authenticated) =============

export interface BunkerPriceQuote {
  portName: string;
  hsfo: number | null;
  vlsfo: number | null;
  lsmgo: number | null;
  updatedAt?: string;
  raw?: Record<string, unknown>;
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const pickField = (row: Record<string, unknown>, keys: string[]): number | null => {
  const lowered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) lowered[k.toLowerCase().replace(/[^a-z0-9]/g, "")] = v;
  for (const k of keys) {
    const val = lowered[k];
    const n = numOrNull(val);
    if (n !== null) return n;
  }
  return null;
};

/** Latest bunker prices for a port (global endpoint, not mode-scoped). */
export async function getBunkerPrices(portName: string): Promise<BunkerPriceQuote | null> {
  const name = (portName || "").trim();
  if (!name) return null;
  try {
    const data = await apiRequest<Record<string, unknown>>(
      "/bunker_price",
      { page: 1, limit: 20, port_name: name },
      { authenticated: true }
    );
    let rows: Record<string, unknown>[] = [];
    for (const key of ["data", "results", "rows", "records", "items", "bunker_prices", "prices"]) {
      const v = data[key];
      if (Array.isArray(v)) { rows = v as Record<string, unknown>[]; break; }
    }
    if (!rows.length) {
      const firstArray = Object.values(data).find((v) => Array.isArray(v));
      if (Array.isArray(firstArray)) rows = firstArray as Record<string, unknown>[];
    }
    if (!rows.length) return null;

    // Merge across rows: some feeds return one row per fuel grade.
    const quote: BunkerPriceQuote = { portName: name, hsfo: null, vlsfo: null, lsmgo: null, raw: rows[0] };
    for (const row of rows) {
      const grade = String(row.fuel_grade_id ?? row.fuel_grade_description ?? row.fuel_type ?? row.grade ?? row.fuel ?? row.product ?? "").toLowerCase();
      const genericPrice = pickField(row, ["price", "priceusd", "usd", "value", "amount"]);

      const hs = pickField(row, ["hsfo", "hsfo380", "ifo380", "hsfoprice", "hsfo_price"]);
      const vl = pickField(row, ["vlsfo", "vlsfo05", "vlsfoprice", "vlsfo_price"]);
      const lm = pickField(row, ["lsmgo", "mgo", "lsmgoprice", "lsmgo_price", "lsgo"]);

      if (hs !== null && quote.hsfo === null) quote.hsfo = hs;
      if (vl !== null && quote.vlsfo === null) quote.vlsfo = vl;
      if (lm !== null && quote.lsmgo === null) quote.lsmgo = lm;

      if (genericPrice !== null && grade) {
        if (/hsfo|high sulfur|380|ifo/.test(grade) && quote.hsfo === null) quote.hsfo = genericPrice;
        else if (/vlsfo|very low|0\.5|lsfo/.test(grade) && quote.vlsfo === null) quote.vlsfo = genericPrice;
        else if (/mgo|gas oil|gasoil|lsmgo/.test(grade) && quote.lsmgo === null) quote.lsmgo = genericPrice;
      }
      const ts = row.published_at ?? row.updated_at ?? row.date ?? row.price_date ?? row.created_at;
      if (!quote.updatedAt && ts) quote.updatedAt = String(ts);
    }
    if (quote.hsfo === null && quote.vlsfo === null && quote.lsmgo === null) return null;
    return quote;
  } catch (e) {
    console.warn("[marineApi] bunker price fetch failed", e);
    return null;
  }
}

// ============= Port DA (Authenticated) =============

export interface PortDaRecord {
  id: string;
  port: string;
  dwt?: string;
  updated?: string;
  date?: string;
  operation?: string;
  amount_local?: number;
  currency?: string;
  usd?: string;
}

export interface PortDaResponse {
  port_da: PortDaRecord[];
  pagination: { total: number; page: number; limit: number; total_pages: number };
}

/** Port disbursement account history for a port (mode-scoped, e.g. /dry-bulk/port-da). */
export async function getPortDa(port: string, page = 1, limit = 20): Promise<PortDaResponse> {
  const data = await apiRequest<Record<string, unknown>>(
    modePath("/port-da"),
    { port, page, limit },
    { authenticated: true }
  );
  let rows: PortDaRecord[] = [];
  for (const key of ["port_da", "data", "results", "rows", "records", "items"]) {
    const v = data[key];
    if (Array.isArray(v)) { rows = v as PortDaRecord[]; break; }
  }
  if (!rows.length) {
    const firstArray = Object.values(data).find((v) => Array.isArray(v));
    if (Array.isArray(firstArray)) rows = firstArray as PortDaRecord[];
  }
  const pagination = (data.pagination as PortDaResponse["pagination"]) ?? {
    total: rows.length, page, limit, total_pages: 1,
  };
  return { port_da: rows, pagination };
}
