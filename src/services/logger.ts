/**
 * Centralized logging service.
 *
 * - Buffers logs and flushes in batches to the `logs` edge function.
 * - Persists unflushed logs to localStorage so they survive reloads / offline periods.
 * - Retries with exponential backoff when the network is down.
 * - Redacts sensitive keys from any context payload.
 * - Generates a stable fingerprint from (message, stack, component) for grouping.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  stack_trace?: string;
  fingerprint?: string;
  url?: string;
  user_agent?: string;
  session_id?: string;
  user_id?: string;
  user_email?: string;
  component?: string;
  page?: string;
  client_timestamp: string;
}

import { MARINE_API_BASE } from "@/services/apiConfig";
const ENDPOINT = `${MARINE_API_BASE}/logs`;

const STORAGE_KEY = "voyagecalc_pending_logs";
const SESSION_KEY = "voyagecalc_log_session";
const MAX_BUFFER = 500;
const FLUSH_INTERVAL_MS = 5000;
const BATCH_SIZE = 25;

const SENSITIVE_KEYS = /^(password|token|authorization|auth|cookie|otp|secret|api[_-]?key|credit[_-]?card|cvv|ssn)$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "********" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function hash(input: string): string {
  // FNV-1a 32-bit — small, deterministic, good enough for grouping.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function fingerprint(message: string, stack?: string, component?: string): string {
  const firstStackLine = stack ? stack.split("\n").slice(0, 3).join("|") : "";
  return hash(`${message}::${firstStackLine}::${component ?? ""}`);
}

function getSessionId(): string {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return "nosession";
  }
}

function currentPageName(): string {
  try {
    return document.title || window.location.pathname;
  } catch {
    return "";
  }
}

// ── User identity — set from AuthContext ────────────────────────────────
let currentUser: { id?: string; email?: string; token?: string } = {};
export function setLoggerUser(u: { id?: string; email?: string; token?: string } | null) {
  currentUser = u ?? {};
}

// ── Buffer + persistence ────────────────────────────────────────────────
let buffer: LogEntry[] = [];
let flushing = false;
let backoffMs = 1000;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function loadPersisted(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-MAX_BUFFER) : [];
  } catch { return []; }
}

function persist() {
  try {
    if (buffer.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer.slice(-MAX_BUFFER)));
  } catch { /* quota — ignore */ }
}

async function flush() {
  if (flushing || buffer.length === 0) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  // Upstream rejects unauthenticated log posts (401). Keep entries buffered
  // until a session token exists, then they are delivered with the next tick.
  if (!currentUser.token) return;
  flushing = true;
  const batch = buffer.slice(0, BATCH_SIZE);
  try {
    // Upstream accepts one log per request — POST each entry sequentially.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (currentUser.token) headers.Authorization = `Bearer ${currentUser.token}`;
    for (const entry of batch) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(entry),
        keepalive: true,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }
    buffer = buffer.slice(batch.length);
    persist();
    backoffMs = 1000;
  } catch {
    // Exponential backoff — leave buffer intact for the next tick.
    backoffMs = Math.min(backoffMs * 2, 60_000);
    await new Promise((r) => setTimeout(r, backoffMs));
  } finally {
    flushing = false;
  }
}

function enqueue(entry: LogEntry) {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
  persist();
}

function baseEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  const context = meta ? (redact(meta) as Record<string, unknown>) : undefined;
  const stack = (meta?.stack as string | undefined) ?? (level === "error" || level === "fatal" ? new Error().stack : undefined);
  const component = (meta?.component as string | undefined) ?? undefined;
  return {
    level,
    message: String(message).slice(0, 4000),
    context,
    stack_trace: stack,
    fingerprint: fingerprint(String(message), stack, component),
    url: typeof window !== "undefined" ? window.location.href : undefined,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    session_id: getSessionId(),
    user_id: currentUser.id,
    user_email: currentUser.email,
    component,
    page: currentPageName(),
    client_timestamp: new Date().toISOString(),
  };
}

function record(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  try {
    enqueue(baseEntry(level, message, meta));
  } catch { /* never let logging throw */ }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => record("debug", msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => record("info", msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => record("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => record("error", msg, meta),
  fatal: (msg: string, meta?: Record<string, unknown>) => record("fatal", msg, meta),
  flush,
};

// ── Initialization ──────────────────────────────────────────────────────
let initialized = false;
export function initLogger() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  buffer = loadPersisted();

  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  window.addEventListener("online", () => { backoffMs = 1000; void flush(); });

  window.addEventListener("beforeunload", () => {
    try {
      if (buffer.length === 0) return;
      // sendBeacon can't set Authorization headers; send each entry as best-effort.
      for (const entry of buffer.slice(0, BATCH_SIZE)) {
        const blob = new Blob([JSON.stringify(entry)], { type: "application/json" });
        navigator.sendBeacon?.(ENDPOINT, blob);
      }
    } catch { /* noop */ }
  });

  // Global handlers
  window.addEventListener("error", (e) => {
    logger.error(e.message || "Unhandled error", {
      stack: e.error?.stack,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      component: "window.onerror",
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = (e.reason as { message?: string; stack?: string } | undefined);
    logger.error("Unhandled promise rejection: " + (reason?.message ?? String(e.reason)), {
      stack: reason?.stack,
      component: "unhandledrejection",
    });
  });

  // Fetch interceptor — log slow / failing requests. Skip the logs endpoint itself.
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.startsWith(ENDPOINT)) {
      return origFetch(input, init);
    }
    const method = (init?.method || (typeof input !== "string" ? (input as Request).method : "GET") || "GET").toUpperCase();
    const start = performance.now();
    try {
      const res = await origFetch(input, init);
      const duration = Math.round(performance.now() - start);
      if (!res.ok) {
        logger.error(`API ${res.status} ${method} ${url}`, { component: "fetch", status: res.status, duration_ms: duration });
      } else if (duration > 2000) {
        logger.warn(`Slow API (${duration}ms) ${method} ${url}`, { component: "fetch", status: res.status, duration_ms: duration });
      }
      return res;
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      logger.error(`Network error ${method} ${url}`, { component: "fetch", duration_ms: duration, stack: (err as Error).stack });
      throw err;
    }
  };

  // Kick off an initial flush.
  void flush();
}

export function shutdownLogger() {
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  initialized = false;
}