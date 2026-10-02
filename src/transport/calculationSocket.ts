/**
 * Calculation WebSocket transport (M7, protocol ws.v1).
 *
 * Owns one socket for one sheet: fetches a single-use ticket over normal JWT
 * auth (D-004; the JWT never goes in the URL), opens the socket, sends
 * heartbeats, and reconnects with exponential backoff and full jitter after a
 * close, when the browser comes back online, or when the page becomes visible
 * again (e.g. after sleep). It knows nothing about sheets or saving: the
 * session layer (voyageSession.ts) decides what to send on (re)open.
 */
import { MARINE_API_BASE } from "@/services/apiConfig";
import { getStoredAuthToken } from "@/utils/authToken";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@/contracts/ws/protocol.generated";

export type SocketStatus = "idle" | "connecting" | "open" | "waiting" | "stopped";

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface SocketDeps {
  fetchTicket(sheetId: string, segment: string): Promise<string>;
  createSocket(url: string): WebSocketLike;
  socketUrl(ticket: string): string;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  random(): number;
  uuid(): string;
  events?: EventTarget; // emits "online"
  now?: () => number;
  visibility?: { addEventListener: EventTarget["addEventListener"]; removeEventListener: EventTarget["removeEventListener"]; visibilityState: string };
}

export const BACKOFF_BASE_MS = 500;
export const BACKOFF_CAP_MS = 30_000;
export const DEFAULT_HEARTBEAT_MS = 20_000;
export const CONNECT_TIMEOUT_MS = 10_000;

/** Full jitter: uniform in [0, min(cap, base·2^attempt)). */
export function backoffDelay(attempt: number, random: () => number): number {
  return Math.floor(random() * Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt));
}

export class TicketError extends Error {
  constructor(public readonly status: number) {
    super(`ticket request failed (${status})`);
  }
}

export async function fetchTicket(sheetId: string, segment: string): Promise<string> {
  const token = getStoredAuthToken();
  if (!token) throw new TicketError(401);
  const res = await fetch(`${MARINE_API_BASE}/ws/ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sheet_id: sheetId, segment }),
  });
  if (!res.ok) throw new TicketError(res.status);
  const body = (await res.json()) as { ticket?: string };
  if (!body.ticket) throw new TicketError(500);
  return body.ticket;
}

export function socketUrl(ticket: string, base: string = MARINE_API_BASE, page: string = typeof location !== "undefined" ? location.href : "http://localhost/"): string {
  const url = new URL(`${base.replace(/\/$/, "")}/ws`, page); // a relative base resolves against the page
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

export const browserSocketDeps = (): SocketDeps => ({
  fetchTicket,
  createSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
  socketUrl,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  random: Math.random,
  uuid: () => crypto.randomUUID(),
  events: typeof window !== "undefined" ? window : undefined,
  visibility: typeof document !== "undefined" ? document : undefined,
});

export interface SocketHandlers {
  /** The socket is open: send connect or resume. */
  onOpen(): void;
  onMessage(msg: ServerMessage): void;
  onStatus(status: SocketStatus, detail?: { code?: number; reason?: string; ticketStatus?: number }): void;
}

type Outgoing = ClientMessage extends infer M ? (M extends unknown ? Omit<M, "protocol_version" | "message_id"> & { message_id?: string } : never) : never;

export class CalculationSocket {
  private ws: WebSocketLike | null = null;
  private attempt = 0;
  private retryTimer: unknown = null;
  private heartbeat: unknown = null;
  private heartbeatMs = DEFAULT_HEARTBEAT_MS;
  private stopped = false;
  private connecting = false;
  private connectTimer: unknown = null;
  private lastInbound = 0;
  status: SocketStatus = "idle";

  constructor(
    private readonly sheetId: string,
    private readonly segment: string,
    private readonly handlers: SocketHandlers,
    private readonly deps: SocketDeps,
  ) {}

  private readonly onOnline = () => this.reconnectNow();
  private readonly onVisibility = () => {
    if (this.deps.visibility?.visibilityState !== "visible") return;
    if (this.ws && this.ws.readyState === 1) this.send({ type: "ping" }); // detect a socket that died in sleep
    else this.reconnectNow();
  };

  start(): void {
    this.stopped = false;
    this.deps.events?.addEventListener("online", this.onOnline);
    this.deps.visibility?.addEventListener("visibilitychange", this.onVisibility);
    void this.open();
  }

  /** Stop for good (fatal conflict, unmount): no more reconnects. */
  stop(code = 1000, reason = "client stop"): void {
    this.stopped = true;
    this.deps.events?.removeEventListener("online", this.onOnline);
    this.deps.visibility?.removeEventListener("visibilitychange", this.onVisibility);
    if (this.retryTimer !== null) this.deps.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.clearConnectTimer();
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      try {
        ws.close(code, reason);
      } catch {
        /* already closed */
      }
    }
    this.setStatus("stopped");
  }

  /** The session is healthy (connected/resumed): reset the backoff. */
  markHealthy(): void {
    this.attempt = 0;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  setHeartbeat(seconds: number): void {
    if (seconds > 0) this.heartbeatMs = seconds * 1000;
    if (this.heartbeat !== null) this.startHeartbeat();
  }

  isOpen(): boolean {
    return !!this.ws && this.ws.readyState === 1;
  }

  /** Sends a message; returns false when the socket is not open. */
  send(msg: Outgoing): boolean {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const full = { ...msg, protocol_version: PROTOCOL_VERSION, message_id: msg.message_id ?? this.deps.uuid() };
    try {
      this.ws.send(JSON.stringify(full));
      return true;
    } catch {
      return false;
    }
  }

  private setStatus(s: SocketStatus, detail?: { code?: number; reason?: string; ticketStatus?: number }) {
    this.status = s;
    this.handlers.onStatus(s, detail);
  }

  private reconnectNow(): void {
    if (this.stopped || this.connecting || this.isOpen()) return;
    if (this.retryTimer !== null) this.deps.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    void this.open();
  }

  private scheduleReconnect(detail?: { code?: number; reason?: string; ticketStatus?: number }): void {
    if (this.stopped) return;
    const delay = backoffDelay(this.attempt, this.deps.random);
    this.attempt++;
    this.setStatus("waiting", detail);
    this.retryTimer = this.deps.setTimeout(() => {
      this.retryTimer = null;
      void this.open();
    }, delay);
  }

  private async open(): Promise<void> {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    this.setStatus("connecting");
    let ticket: string;
    try {
      ticket = await this.deps.fetchTicket(this.sheetId, this.segment);
    } catch (e) {
      this.connecting = false;
      const status = e instanceof TicketError ? e.status : 0;
      if (status === 401 || status === 403 || status === 404) {
        this.setStatus("stopped", { ticketStatus: status }); // not retryable: access or session problem
        this.stopped = true;
        return;
      }
      this.scheduleReconnect({ ticketStatus: status });
      return;
    }
    if (this.stopped) {
      this.connecting = false;
      return;
    }
    let ws: WebSocketLike;
    try {
      ws = this.deps.createSocket(this.deps.socketUrl(ticket));
    } catch {
      this.connecting = false;
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    // A socket stuck connecting is abandoned (onclose then reconnects).
    this.connectTimer = this.deps.setTimeout(() => {
      this.connectTimer = null;
      if (ws.readyState !== 1) {
        try {
          ws.close(4000, "connect timeout");
        } catch {
          /* closed */
        }
      }
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      this.connecting = false;
      this.clearConnectTimer();
      this.lastInbound = this.now();
      // The backoff resets only once the session is healthy (markHealthy):
      // a server that accepts and then closes must not cause a storm.
      this.setStatus("open");
      this.startHeartbeat();
      this.handlers.onOpen();
    };
    ws.onmessage = (ev) => {
      this.lastInbound = this.now();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handlers.onMessage(msg);
    };
    ws.onerror = () => {
      /* onclose follows */
    };
    ws.onclose = (ev) => {
      this.connecting = false;
      this.clearConnectTimer();
      if (this.ws === ws) this.ws = null;
      this.stopHeartbeat();
      this.scheduleReconnect({ code: ev.code, reason: ev.reason });
    };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = this.deps.setInterval(() => {
      // Nothing received for two heartbeats (pongs included): a half-open
      // socket (e.g. after sleep). Close it; onclose reconnects and resumes.
      if (this.ws && this.now() - this.lastInbound > 2 * this.heartbeatMs + 5_000) {
        try {
          this.ws.close(4000, "no heartbeat");
        } catch {
          /* closed */
        }
        return;
      }
      this.send({ type: "ping" });
    }, this.heartbeatMs);
  }

  private clearConnectTimer(): void {
    if (this.connectTimer !== null) this.deps.clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) this.deps.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}
