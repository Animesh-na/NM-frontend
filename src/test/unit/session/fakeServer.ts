/**
 * In-memory WebSocket + server for the M7 session tests. The test plays the
 * server: it sees every client message and sends ws.v1 messages back.
 */
import type { SocketDeps, WebSocketLike } from "@/transport/calculationSocket";
import type { SessionDeps } from "@/session/voyageSession";
import type { ChannelLike } from "@/session/tabCoordinator";

export type Sent = Record<string, unknown> & { type: string };

export class FakeSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: Sent[] = [];
  constructor(readonly url: string, private readonly server: FakeServer) {}
  send(data: string): void {
    const m = JSON.parse(data) as Sent;
    this.sent.push(m);
    this.server.received.push(m);
    this.server.onClientMessage?.(m, this);
  }
  close(code = 1000, reason?: string): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  /** Server side: open the socket. */
  accept(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  /** Server side: send a message to the client. */
  push(m: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify({ protocol_version: "ws.v1", message_id: `s-${++msgSeq}`, ...m }) });
  }
  /** Server side: drop the connection (network loss). */
  drop(code = 1006): void {
    this.close(code, "dropped");
  }
}

let msgSeq = 0;

export class FakeServer {
  sockets: FakeSocket[] = [];
  received: Sent[] = [];
  tickets = 0;
  ticketError: number | null = null;
  onClientMessage?: (m: Sent, s: FakeSocket) => void;
  get last(): FakeSocket {
    return this.sockets[this.sockets.length - 1];
  }
  ofType(type: string): Sent[] {
    return this.received.filter((m) => m.type === type);
  }
}

export function socketDeps(server: FakeServer, opts: { random?: () => number; events?: EventTarget; visibility?: SocketDeps["visibility"] } = {}): SocketDeps {
  let id = 0;
  return {
    fetchTicket: async () => {
      if (server.ticketError) {
        const { TicketError } = await import("@/transport/calculationSocket");
        throw new TicketError(server.ticketError);
      }
      server.tickets++;
      return `ticket-${server.tickets}`;
    },
    createSocket: (url) => {
      const s = new FakeSocket(url, server);
      server.sockets.push(s);
      return s;
    },
    socketUrl: (t) => `ws://test/ws?ticket=${t}`,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    random: opts.random ?? (() => 0.5),
    uuid: () => `c-${++id}`,
    events: opts.events,
    visibility: opts.visibility,
  };
}

export function sessionDeps(server: FakeServer, extra: Partial<SessionDeps> & { random?: () => number } = {}): SessionDeps {
  return {
    socket: socketDeps(server, { random: extra.random }),
    loadSavedDoc: extra.loadSavedDoc ?? (async () => ({ data: {}, version: null })),
    tabs: extra.tabs,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
}

export const LIMITS = { max_message_bytes: 65536, max_ops_per_patch: 100, heartbeat_seconds: 20, idle_timeout_seconds: 60 };

export function sessionState(over: Record<string, unknown> = {}) {
  return {
    session_id: "sess-1", working_sequence: 0, persisted_version: 1, last_client_sequence: 0, dirty: false,
    engine_version: "2026.10.0", reference_data_version: "ref-2026.10.0",
    sheet: { vessel: { name: "V", dwt: 81000 }, sequence: [{ id: 1 }] },
    limits: LIMITS, ...over,
  };
}

/** Flushes pending promise callbacks (ticket fetch) under fake timers. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** A BroadcastChannel stand-in shared by the "tabs" of one test. */
export function channelBus(): { channel(): ChannelLike } {
  const members = new Set<ChannelLike>();
  return {
    channel() {
      const ch: ChannelLike = {
        onmessage: null,
        postMessage: (m) => members.forEach((o) => o !== ch && o.onmessage?.({ data: m })),
        close: () => members.delete(ch),
      };
      members.add(ch);
      return ch;
    },
  };
}
