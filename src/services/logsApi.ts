import { MARINE_API_BASE } from "@/services/apiConfig";

const BASE = `${MARINE_API_BASE}`;

export interface LogRow {
  id: number;
  level: string;
  message: string;
  context: Record<string, unknown> | null;
  stack_trace: string | null;
  fingerprint: string | null;
  url: string | null;
  user_agent: string | null;
  browser: string | null;
  session_id: string | null;
  ip_address: string | null;
  user_id: string | null;
  user_email: string | null;
  component: string | null;
  page: string | null;
  client_timestamp: string | null;
  created_at: string;
}

export interface LogQuery {
  page?: number;
  limit?: number;
  user_id?: string;
  user_email?: string;
  level?: string;
  session_id?: string;
  browser?: string;
  from_date?: string;
  to_date?: string;
  from?: string;
  to?: string;
  search?: string;
  sort?: "asc" | "desc";
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchLogs(token: string, q: LogQuery = {}): Promise<{ logs: LogRow[]; pagination: { page: number; limit: number; total: number } }> {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== "" && v !== null) params.append(k, String(v)); });
  const res = await fetch(`${BASE}/admin/logs?${params.toString()}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Failed to load logs (${res.status})`);
  const data = await res.json();
  // Normalize: upstream may return { logs, pagination } or { data, meta } or raw array.
  if (Array.isArray(data)) {
    return { logs: data, pagination: { page: q.page ?? 1, limit: q.limit ?? data.length, total: data.length } };
  }
  const logs: LogRow[] = data.logs ?? data.data ?? [];
  const pagination = data.pagination ?? {
    page: data.meta?.page ?? q.page ?? 1,
    limit: data.meta?.limit ?? q.limit ?? logs.length,
    total: data.meta?.total ?? data.total ?? logs.length,
  };
  return { logs, pagination };
}

export async function fetchLogStats(token: string): Promise<{
  total: number; errors: number; warnings: number; fatal: number; today: number;
  by_day: Record<string, number>;
}> {
  const res = await fetch(`${BASE}/admin/logs/stats`, { headers: authHeaders(token) });
  if (!res.ok) {
    // Upstream may not expose stats — return zeros instead of throwing.
    return { total: 0, errors: 0, warnings: 0, fatal: 0, today: 0, by_day: {} };
  }
  return res.json();
}