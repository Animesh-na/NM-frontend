import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getLatestBunkerPrices, type LatestBunkerPriceRow } from "@/services/marineApi";

export type BunkerFuel = "hsfo" | "vlsfo" | "lsmgo";

interface BunkerPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fuel whose price field was double-clicked. */
  fuel: BunkerFuel;
  /** Row label, e.g. BOB or the bunkering port name. */
  target?: string;
  /** Initial search term (usually the row's port name). */
  initialSearch?: string;
  onSelect: (price: number, row: LatestBunkerPriceRow) => void;
}

export function BunkerPriceDialog({
  open, onOpenChange, fuel, target, initialSearch, onSelect,
}: BunkerPriceDialogProps) {
  const [search, setSearch] = useState(initialSearch || "");
  const [rows, setRows] = useState<LatestBunkerPriceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getLatestBunkerPrices({ portName: term, page: 1, limit: 50 });
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bunker prices");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSearch(initialSearch || "");
    load(initialSearch || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const label = fuel.toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Latest bunker prices — {label}
            {target ? <span className="ml-1 text-xs font-normal text-muted-foreground">for {target}</span> : null}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search port name..."
            className="form-input-sm h-8 w-full pl-7 text-xs"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded border border-border">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-muted">
              <tr className="text-muted-foreground">
                <th className="px-2 py-1 text-left font-medium">Port</th>
                <th className="px-2 py-1 text-left font-medium">Country</th>
                <th className="px-2 py-1 text-right font-medium">HSFO</th>
                <th className="px-2 py-1 text-right font-medium">VLSFO</th>
                <th className="px-2 py-1 text-right font-medium">LSMGO</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">
                  <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading prices...
                </td></tr>
              )}
              {!loading && error && (
                <tr><td colSpan={6} className="px-2 py-4 text-center text-destructive">{error}</td></tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr><td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">No prices found.</td></tr>
              )}
              {!loading && !error && rows.map((r) => {
                const price = r[fuel];
                return (
                  <tr key={r.portId + r.portName} className="border-t border-border hover:bg-muted/50">
                    <td className="px-2 py-1 font-medium">{r.portName}</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.countryName}</td>
                    <td className={`px-2 py-1 text-right font-mono ${fuel === "hsfo" ? "font-semibold text-primary" : ""}`}>{r.hsfo?.toFixed(2) ?? "—"}</td>
                    <td className={`px-2 py-1 text-right font-mono ${fuel === "vlsfo" ? "font-semibold text-primary" : ""}`}>{r.vlsfo?.toFixed(2) ?? "—"}</td>
                    <td className={`px-2 py-1 text-right font-mono ${fuel === "lsmgo" ? "font-semibold text-primary" : ""}`}>{r.lsmgo?.toFixed(2) ?? "—"}</td>
                    <td className="px-2 py-1 text-right">
                      <Button
                        type="button" size="sm" variant="outline"
                        className="h-6 px-2 text-[10px]"
                        disabled={!price}
                        onClick={() => { if (price) { onSelect(price, r); onOpenChange(false); } }}
                      >
                        Use
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
