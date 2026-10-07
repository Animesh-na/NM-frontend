/**
 * Centralized logging service.
 *
 * - Buffers logs and flushes them in batches to the backend (POST /api/v1/logs),
 *   which stores them for the admin log viewer and writes them to the log
 *   pipeline as log_type=frontend (Loki), separate from backend logs.
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
  component?: string;
  page?: string;
  /** W3C trace id of the API call the entry is about: links it to the backend trace. */
  trace_id?: string;
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
// Only the id travels with log entries (never the email); the token
// authenticates the upload.
let currentUser: { id?: string; token?: string } = {};
export function setLoggerUser(u: { id?: string; token?: string } | null) {
  currentUser = u ? { id: u.id, token: u.token } : {};
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
    // One request per batch ({"logs": [...]}, at most BATCH_SIZE entries).
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (currentUser.token) headers.Authorization = `Bearer ${currentUser.token}`;
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ logs: batch }),
      keepalive: true,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    component,
    page: currentPageName(),
    trace_id: typeof meta?.trace_id === "string" ? meta.trace_id : undefined,
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

/**
 * User-activity tracking.
 *
 * `action` is a stable dot-separated verb (e.g. "sheet.save", "admin.user.create")
 * so activity can be grouped/filtered server-side independently of the message text.
 */
export function trackEvent(
  action: string,
  meta?: Record<string, unknown>,
  level: LogLevel = "info",
): void {
  record(level, `[activity] ${action}`, { ...meta, action, kind: "activity" });
}

/** Track navigation between app views/pages. */
let lastView = "";
export function trackView(view: string, meta?: Record<string, unknown>): void {
  if (view === lastView) return;
  lastView = view;
  trackEvent("navigation.view", { ...meta, view, component: "Navigation" });
}

// ── Initialization ──────────────────────────────────────────────────────
let initialized = false;
export function initLogger() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  buffer = loadPersisted();

  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  window.addEventListener("online", () => { backoffMs = 1000; void flush(); });
  // Entries still buffered when the page closes are already persisted in
  // localStorage and are sent after the next load (a beacon cannot carry the
  // Authorization header the endpoint requires).

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

  // Fetch interceptor — traces API calls and logs slow / failing ones. The
  // logs endpoint itself is left alone.
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.startsWith(ENDPOINT)) {
      return origFetch(input, init);
    }
    const method = (init?.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
    const traced = withTraceparent(input, init);
    const path = apiPath(url);
    const start = performance.now();
    try {
      const res = await origFetch(input, traced.init);
      const duration = Math.round(performance.now() - start);
      if (!res.ok) {
        logger.error(`API ${res.status} ${method} ${path}`, { component: "fetch", status: res.status, duration_ms: duration, trace_id: traced.traceId });
      } else if (duration > 2000) {
        logger.warn(`Slow API (${duration}ms) ${method} ${path}`, { component: "fetch", status: res.status, duration_ms: duration, trace_id: traced.traceId });
      }
      return res;
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      logger.error(`Network error ${method} ${path}`, { component: "fetch", duration_ms: duration, stack: (err as Error).stack, trace_id: traced.traceId });
      throw err;
    }
  };

  // Kick off an initial flush.
  void flush();
}

// ── Trace context for API calls ─────────────────────────────────────────
function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Whether a URL is this app's own API on the page's origin (no CORS preflight). */
export function isSameOriginApi(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    const api = new URL(MARINE_API_BASE, window.location.href);
    return u.origin === window.location.origin && u.origin === api.origin && u.pathname.startsWith(api.pathname);
  } catch {
    return false;
  }
}

/**
 * Adds a W3C traceparent to a same-origin API call so the backend continues
 * the trace; returns the trace id (to put on the call's log entries) and the
 * init to send. An existing traceparent, a Request object or another origin
 * is left untouched.
 */
export function withTraceparent(input: RequestInfo | URL, init?: RequestInit): { init?: RequestInit; traceId?: string } {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : "";
  if (!url || !isSameOriginApi(url)) return { init };
  const headers = new Headers(init?.headers);
  const existing = headers.get("traceparent");
  if (existing) return { init, traceId: existing.split("-")[1] };
  const traceId = randomHex(16);
  headers.set("traceparent", `00-${traceId}-${randomHex(8)}-01`);
  return { init: { ...init, headers }, traceId };
}

/** The URL's path without query or fragment (stable messages, grouped issues). */
function apiPath(url: string): string {
  try {
    return new URL(url, window.location.href).pathname;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

export function shutdownLogger() {
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  initialized = false;
}