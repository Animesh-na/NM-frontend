import { MARINE_API_KEY } from "@/services/apiConfig";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const BASE = `https://${PROJECT_ID}.functions.supabase.co/logs`;

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
  level?: string;
  session_id?: string;
  browser?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  sort?: "asc" | "desc";
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    // pass marine key for parity — validate endpoint requires it upstream
    "X-Marine-Key": MARINE_API_KEY,
  };
}

export async function fetchLogs(token: string, q: LogQuery = {}): Promise<{ logs: LogRow[]; pagination: { page: number; limit: number; total: number } }> {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== "" && v !== null) params.append(k, String(v)); });
  const res = await fetch(`${BASE}?${params.toString()}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Failed to load logs (${res.status})`);
  return res.json();
}

export async function fetchLogStats(token: string): Promise<{
  total: number; errors: number; warnings: number; fatal: number; today: number;
  by_day: Record<string, number>;
}> {
  const res = await fetch(`${BASE}/stats`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Failed to load log stats (${res.status})`);
  return res.json();
}