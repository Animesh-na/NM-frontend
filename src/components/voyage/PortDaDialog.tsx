import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { getPortDa, type PortDaRecord } from "@/services/marineApi";

const fmtDate = (v?: string) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Port DA history popup — opened by double-clicking the Exp DA cell in the
 * sequence table. Lets the user pick a historical disbursement to apply.
 */
export function PortDaDialog({
  open,
  onOpenChange,
  port,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  port: string;
  onSelect?: (amount: number) => void;
}) {
  const [rows, setRows] = useState<PortDaRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !port) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPortDa(port)
      .then((res) => { if (!cancelled) setRows(res.port_da); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load port DA"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, port]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Port DA History — {port || "—"}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading port DA…
          </div>
        ) : error ? (
          <div className="py-8 text-center text-xs text-destructive">{error}</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">No DA records found for this port.</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-semibold">Port</th>
                  <th className="px-2 py-1.5 font-semibold text-right">DWT</th>
                  <th className="px-2 py-1.5 font-semibold">Operation</th>
                  <th className="px-2 py-1.5 font-semibold">Date</th>
                  <th className="px-2 py-1.5 font-semibold">Updated</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Amount</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-accent/40">
                    <td className="px-2 py-1.5">{r.port}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.dwt ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.operation ?? "—"}</td>
                    <td className="px-2 py-1.5">{fmtDate(r.date)}</td>
                    <td className="px-2 py-1.5">{fmtDate(r.updated)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {r.usd ?? (r.amount_local != null ? `${r.currency ?? ""} ${r.amount_local.toLocaleString()}` : "—")}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {onSelect && r.amount_local != null && (
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-[10px] hover:bg-accent"
                          onClick={() => { onSelect(r.amount_local as number); onOpenChange(false); }}
                        >
                          Use
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
