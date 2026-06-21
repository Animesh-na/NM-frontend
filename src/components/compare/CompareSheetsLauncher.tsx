import { useEffect, useMemo, useState } from "react";
import { GitCompare, Loader2, Search, X } from "lucide-react";
import { useSheets } from "@/context/sheetContextCore";
import { listSheets, listOrganizationSheets, type SheetListItem } from "@/services/marineApi";
import { toast } from "@/components/ui/sonner";

const MAX = 5;
const MIN = 2;

interface Props {
  variant?: "dashboard" | "compact";
}

export function CompareSheetsLauncher({ variant = "dashboard" }: Props) {
  const { openCompare } = useSheets();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sheets, setSheets] = useState<SheetListItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Pull a generous batch from both endpoints
        const [mine, org] = await Promise.all([
          listSheets(1, 200),
          listOrganizationSheets(1, 200).catch(() => ({ sheets: [], pagination: { total: 0, page: 1, limit: 0, total_pages: 1 } })),
        ]);
        if (cancelled) return;
        const map = new Map<string, SheetListItem>();
        for (const s of mine.sheets || []) map.set(s.id, s);
        for (const s of org.sheets || []) if (!map.has(s.id)) map.set(s.id, s);
        setSheets(Array.from(map.values()));
      } catch {
        if (!cancelled) toast.error("Failed to load sheets");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sheets;
    return sheets.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.owner_email || "").toLowerCase().includes(q)
    );
  }, [sheets, search]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      if (next.size >= MAX) {
        toast.error(`Maximum ${MAX} sheets can be compared at once.`);
        return prev;
      }
      next.add(id);
      return next;
    });
  };

  const canCompare = selected.size >= MIN;

  const handleCompare = () => {
    if (!canCompare) return;
    openCompare(Array.from(selected));
    setOpen(false);
    setSelected(new Set());
    setSearch("");
  };

  const btnCls = variant === "compact"
    ? "flex items-center gap-1 hover:text-white/80 transition-colors"
    : "flex items-center gap-1 h-7 px-2.5 rounded-md hover:bg-section-header-foreground/10 transition-colors text-section-header-foreground/70";

  return (
    <>
      <button onClick={() => setOpen(true)} className={btnCls} title="Compare voyage sheets">
        <GitCompare className={variant === "compact" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        <span>Compare Sheets</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-card text-foreground rounded-lg shadow-2xl border border-border w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold">Select Voyage Sheets to Compare</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Selected: <span className={`font-semibold ${selected.size >= MIN ? "text-success" : "text-foreground"}`}>{selected.size}</span> / {MAX} · Min {MIN}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by sheet name, vessel, or owner..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="form-input-sm w-full pl-8 h-8 text-xs"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading sheets...
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10 text-xs text-muted-foreground">No sheets found.</div>
              ) : (
                <ul className="space-y-1">
                  {filtered.map(s => {
                    const checked = selected.has(s.id);
                    const disabled = !checked && selected.size >= MAX;
                    return (
                      <li
                        key={s.id}
                        onClick={() => !disabled && toggle(s.id)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded border text-xs cursor-pointer transition-colors ${
                          checked
                            ? "border-primary bg-primary/5"
                            : disabled
                              ? "border-border opacity-50 cursor-not-allowed"
                              : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          readOnly
                          className="h-3.5 w-3.5 accent-primary pointer-events-none"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{s.name}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                            {s.owner_email && <span>{s.owner_email}</span>}
                            <span>Updated {new Date(s.updated_at || s.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setOpen(false)} className="h-7 px-3 text-xs rounded border border-border hover:bg-muted">Cancel</button>
              <button
                onClick={handleCompare}
                disabled={!canCompare}
                className="h-7 px-4 text-xs rounded bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Compare ({selected.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}