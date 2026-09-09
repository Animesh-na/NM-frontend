import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/**
 * Tanker-mode DA split popup — lets the user segregate a port DA into
 * Charterer's Acct. and Owner's Acct. Only the Owner's Acct. amount is
 * used in voyage calculations; the Charterer's amount is reference-only.
 */
export function DaSplitDialog({
  open,
  onOpenChange,
  port,
  ownerAmount,
  chartererAmount,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  port: string;
  ownerAmount: number;
  chartererAmount: number;
  onSave: (owner: number, charterer: number) => void;
}) {
  const [owner, setOwner] = useState("");
  const [charterer, setCharterer] = useState("");

  useEffect(() => {
    if (!open) return;
    setOwner(ownerAmount ? String(ownerAmount) : "");
    setCharterer(chartererAmount ? String(chartererAmount) : "");
  }, [open, ownerAmount, chartererAmount]);

  const ownerNum = parseFloat(owner) || 0;
  const chartererNum = parseFloat(charterer) || 0;
  const total = ownerNum + chartererNum;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">DA Split — {port || "—"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <label className="text-[11px] font-medium">Charterer&prime;s Acct. ($)</label>
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right text-[11px]"
              value={charterer}
              onChange={(e) => setCharterer(e.target.value)}
              placeholder="0"
            />
            <p className="text-[10px] text-muted-foreground">Reference only — not included in calculations.</p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium">Owner&prime;s Acct. ($)</label>
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right text-[11px]"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="0"
            />
            <p className="text-[10px] text-muted-foreground">This amount is used as the port DA in all calculations.</p>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-2 text-[11px]">
            <span className="text-muted-foreground">Total DA (Charterer + Owner)</span>
            <span className="font-mono font-semibold">${total.toLocaleString()}</span>
          </div>
        </div>

        <DialogFooter>
          <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => { onSave(ownerNum, chartererNum); onOpenChange(false); }}
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
