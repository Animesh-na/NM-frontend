/**
 * Save status and conflict UI for the server calculation session (M7).
 * Status is text plus icon (never colour only) and is announced politely.
 */
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, Lock, RefreshCw, Save, Server, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SAVE_STATE_LABEL, type SaveState } from "@/session/saveState";
import type { ConflictInfo, SessionSnapshot } from "@/session/voyageSession";
import type { ResultSource } from "@/context/VoyageContext";

const ICON: Record<SaveState, ReactNode> = {
  LOCAL_ONLY: <Save className="h-3.5 w-3.5" aria-hidden />,
  CALCULATING: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
  SAVE_PENDING: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
  SAVED: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />,
  SAVE_FAILED: <XCircle className="h-3.5 w-3.5" aria-hidden />,
  CONFLICT: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
  OFFLINE: <CloudOff className="h-3.5 w-3.5" aria-hidden />,
  RECOVERING: <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />,
};

export function SessionStatusBar({ snap, onTakeOver, resultSource = "local" }: { snap: SessionSnapshot; onTakeOver: () => void; resultSource?: ResultSource }) {
  if (snap.role === "readonly") {
    return (
      <div role="status" className="bg-warning/10 border-b border-warning/30 text-amber-800 dark:text-amber-300 px-4 py-1.5 text-[11px] flex items-center justify-between gap-2 flex-shrink-0">
        <span className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {snap.notice ?? "This sheet is being edited in another tab or device."} Read-only here.
        </span>
        <Button type="button" size="sm" variant="outline" className="h-6 text-[11px]" data-readonly-allowed="true" onClick={onTakeOver}>
          Take over editing
        </Button>
      </div>
    );
  }
  const label = snap.role === "stopped" ? snap.notice ?? "Not connected" : SAVE_STATE_LABEL[snap.saveState];
  return (
    <div className="border-b border-[hsl(var(--dash-border))] px-4 py-1 text-[11px] flex items-center justify-between flex-shrink-0">
      <span role="status" aria-live="polite" className="flex items-center gap-1.5" data-save-state={snap.saveState}>
        {ICON[snap.saveState]}
        <span>{label}</span>
        {snap.persistedVersion !== null && snap.saveState === "SAVED" && <span className="text-muted-foreground">(version {snap.persistedVersion})</span>}
      </span>
      {snap.heldPaths.length > 0 && (
        <span className="text-muted-foreground">{snap.heldPaths.length} incomplete field{snap.heldPaths.length > 1 ? "s" : ""} not sent yet</span>
      )}
      {resultSource !== "local" && (
        <span className="flex items-center gap-1 text-muted-foreground" data-result-source={resultSource}>
          {resultSource === "server" ? <Server className="h-3.5 w-3.5" aria-hidden /> : <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {resultSource === "server" ? "Results: server" : "Results: browser (server calculating…)"}
        </span>
      )}
    </div>
  );
}

function describe(path: string): string {
  return path.slice(1).split("/").map((s) => (/^\d+$/.test(s) ? `#${Number(s) + 1}` : s)).join(" › ");
}

export function ConflictDialog({ conflict, onResolve }: { conflict: ConflictInfo | null; onResolve: (choice: "reload" | "reapply" | "acknowledge-engine") => void }) {
  if (!conflict) return null;
  if (conflict.reason === "ENGINE_VERSION_CHANGED") {
    return (
      <Dialog open>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Calculation engine updated</DialogTitle>
            <DialogDescription>
              This sheet was last calculated with an older engine version. Recalculate it with the current version?
              The last saved result stays unchanged until you save.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onResolve("acknowledge-engine")}>Recalculate with the current version</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>This sheet was changed elsewhere</DialogTitle>
          <DialogDescription>
            {conflict.reason === "VERSION_CONFLICT"
              ? `A newer version was saved${conflict.currentVersion ? ` (version ${conflict.currentVersion})` : ""} while you were editing.`
              : "After reconnecting, the server's copy differs from yours."}{" "}
            Nothing has been discarded. Choose how to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="text-xs">
          {conflict.serverDoc === null ? (
            <p className="text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Loading the saved version…</p>
          ) : conflict.differences.length === 0 ? (
            <p className="text-muted-foreground">No differences in the calculation inputs.</p>
          ) : (
            <>
              <p className="font-medium mb-1">Fields that differ from the saved version:</p>
              <ul className="list-disc pl-5 space-y-0.5 max-h-40 overflow-y-auto">
                {conflict.differences.map((p) => <li key={p}><code>{describe(p)}</code></li>)}
              </ul>
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={conflict.serverDoc === null} onClick={() => onResolve("reload")}>Load the saved version</Button>
          <Button disabled={conflict.serverDoc === null} onClick={() => onResolve("reapply")}>Keep my changes on top</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
