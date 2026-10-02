/**
 * Same-browser tab coordination for one sheet (M7, D-006).
 *
 * One tab edits a sheet; other tabs are read-only with "Take over editing".
 * BroadcastChannel lets a new tab see that another tab already owns the sheet
 * (so it starts read-only without contending for the lease) and tells the old
 * owner immediately when another tab takes over. The server lease is the real
 * guard (it also covers other devices): a stale owner's next write is
 * rejected with STALE_FENCE regardless of this channel.
 */
export interface TabCoordinator {
  /** Asks the other tabs whether one of them edits this sheet now. */
  otherOwnerAlive(): Promise<boolean>;
  claimOwnership(takeOver: boolean): void;
  release(): void;
  announceSaved(version: number): void;
  /** Called when another tab takes over editing from this one. */
  onTakenOver(cb: () => void): void;
  /** Called when the owner tab saved (read-only tabs can offer a reload). */
  onSavedElsewhere(cb: (version: number) => void): void;
  close(): void;
}

type Msg =
  | { kind: "who-owns"; from: string }
  | { kind: "owner"; from: string }
  | { kind: "taken-over"; from: string }
  | { kind: "released"; from: string }
  | { kind: "saved"; from: string; version: number };

export interface ChannelLike {
  postMessage(m: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

export const OWNER_PROBE_MS = 150;

export function createTabCoordinator(
  sheetId: string,
  opts: { channel?: ChannelLike; tabId?: string; setTimeout?: (fn: () => void, ms: number) => unknown } = {},
): TabCoordinator {
  const tabId = opts.tabId ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random()));
  const channel: ChannelLike | null =
    opts.channel ?? (typeof BroadcastChannel !== "undefined" ? (new BroadcastChannel(`voyage-sheet:${sheetId}`) as unknown as ChannelLike) : null);
  const wait = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  let owner = false;
  let probe: ((alive: boolean) => void) | null = null;
  let takenOver: () => void = () => undefined;
  let savedElsewhere: (v: number) => void = () => undefined;

  const post = (m: Msg) => channel?.postMessage(m);
  if (channel) {
    channel.onmessage = (ev) => {
      const m = ev.data as Msg;
      if (!m || m.from === tabId) return;
      switch (m.kind) {
        case "who-owns":
          if (owner) post({ kind: "owner", from: tabId });
          return;
        case "owner":
          probe?.(true);
          return;
        case "taken-over":
          if (owner) {
            owner = false;
            takenOver();
          }
          return;
        case "saved":
          if (!owner) savedElsewhere(m.version);
          return;
        case "released":
          return;
      }
    };
  }

  return {
    otherOwnerAlive() {
      if (!channel) return Promise.resolve(false);
      return new Promise((resolve) => {
        let done = false;
        probe = (alive) => {
          if (done) return;
          done = true;
          probe = null;
          resolve(alive);
        };
        post({ kind: "who-owns", from: tabId });
        wait(() => probe?.(false), OWNER_PROBE_MS);
      });
    },
    claimOwnership(takeOver) {
      owner = true;
      if (takeOver) post({ kind: "taken-over", from: tabId });
    },
    release() {
      if (owner) post({ kind: "released", from: tabId });
      owner = false;
    },
    announceSaved(version) {
      post({ kind: "saved", from: tabId, version });
    },
    onTakenOver(cb) {
      takenOver = cb;
    },
    onSavedElsewhere(cb) {
      savedElsewhere = cb;
    },
    close() {
      this.release();
      channel?.close();
    },
  };
}
