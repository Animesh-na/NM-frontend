import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Loader2, Search, X, BookOpen, FileText } from "lucide-react";
import { useSheets } from "@/context/sheetContextCore";
import {
  listWorkbooks,
  searchWorkbooks,
  listWorkbookSheets,
  type WorkbookItem,
  type WorkbookSheetItem,
} from "@/services/marineApi";
import { toast } from "@/components/ui/sonner";

const MAX = 5;
const MIN = 1;
const WB_LIMIT = 8;
const SHEET_LIMIT = 10;

interface Props {
  variant?: "dashboard" | "compact";
}

interface SelectedSheet {
  id: string;
  name: string;
  workbookName?: string;
}

export function CopySheetsLauncher({ variant = "dashboard" }: Props) {
  const { copySheets, activeTab } = useSheets();
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  // View: "workbooks" list or a workbook's "sheets"
  const [workbook, setWorkbook] = useState<{ id: string; name: string } | null>(null);

  // Workbook list state
  const [wbLoading, setWbLoading] = useState(false);
  const [workbooks, setWorkbooks] = useState<WorkbookItem[]>([]);
  const [wbPage, setWbPage] = useState(1);
  const [wbPages, setWbPages] = useState(1);
  const [wbSearch, setWbSearch] = useState("");

  // Sheets state
  const [shLoading, setShLoading] = useState(false);
  const [sheets, setSheets] = useState<WorkbookSheetItem[]>([]);
  const [shPage, setShPage] = useState(1);
  const [shPages, setShPages] = useState(1);
  const [shSearch, setShSearch] = useState("");

  const [selected, setSelected] = useState<SelectedSheet[]>([]);

  const reset = useCallback(() => {
    setOpen(false);
    setSelected([]);
    setWbSearch("");
    setShSearch("");
    setWbPage(1);
    setShPage(1);
  }, []);

  // On open: default to the current workbook when the active sheet has one
  useEffect(() => {
    if (!open) return;
    if (activeTab?.workbookId) {
      setWorkbook({ id: activeTab.workbookId, name: activeTab.workbookName || "Current Workbook" });
    } else {
      setWorkbook(null);
    }
  }, [open, activeTab?.workbookId, activeTab?.workbookName]);

  // Load workbooks (list or search)
  useEffect(() => {
    if (!open || workbook) return;
    let cancelled = false;
    const run = async () => {
      setWbLoading(true);
      try {
        const q = wbSearch.trim();
        const res = q.length >= 2
          ? await searchWorkbooks(q, wbPage, WB_LIMIT)
          : await listWorkbooks(wbPage, WB_LIMIT);
        if (cancelled) return;
        setWorkbooks(res.workbooks || []);
        setWbPages(res.pagination?.total_pages || 1);
      } catch {
        if (!cancelled) toast.error("Failed to load workbooks");
      } finally {
        if (!cancelled) setWbLoading(false);
      }
    };
    const t = setTimeout(run, wbSearch.trim() ? 300 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, workbook, wbPage, wbSearch]);

  // Load workbook sheets
  useEffect(() => {
    if (!open || !workbook) return;
    let cancelled = false;
    (async () => {
      setShLoading(true);
      try {
        const res = await listWorkbookSheets(workbook.id, shPage, SHEET_LIMIT);
        if (cancelled) return;
        setSheets(res.sheets || []);
        setShPages(res.pagination?.total_pages || 1);
      } catch {
        if (!cancelled) toast.error("Failed to load sheets");
      } finally {
        if (!cancelled) setShLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, workbook, shPage]);

  const filteredSheets = useMemo(() => {
    const q = shSearch.trim().toLowerCase();
    if (!q) return sheets;
    return sheets.filter(s =>
      s.name.toLowerCase().includes(q) || (s.owner_email || "").toLowerCase().includes(q)
    );
  }, [sheets, shSearch]);

  const toggle = (s: WorkbookSheetItem) => {
    setSelected(prev => {
      if (prev.some(p => p.id === s.id)) return prev.filter(p => p.id !== s.id);
      if (prev.length >= MAX) {
        toast.error(`Maximum ${MAX} sheets can be copied at once.`);
        return prev;
      }
      return [...prev, { id: s.id, name: s.name, workbookName: workbook?.name }];
    });
  };

  const canCopy = selected.length >= MIN && !copying;

  const handleCopy = async () => {
    if (!canCopy) return;
    setCopying(true);
    try {
      await copySheets(selected.map(s => s.id));
      reset();
    } finally {
      setCopying(false);
    }
  };

  const btnCls = variant === "compact"
    ? "touch-icon sm:w-auto sm:px-2.5 flex items-center justify-center gap-1 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors font-medium"
    : "flex items-center gap-1 h-7 px-2.5 rounded-md hover:bg-section-header-foreground/10 transition-colors text-section-header-foreground/70";

  const Pager = ({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) => (
    pages > 1 ? (
      <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[11px]">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="flex items-center gap-1 h-6 px-2 rounded border border-border disabled:opacity-40 hover:bg-muted"
        >
          <ChevronLeft className="h-3 w-3" /> Prev
        </button>
        <span className="text-muted-foreground">Page {page} of {pages}</span>
        <button
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page >= pages}
          className="flex items-center gap-1 h-6 px-2 rounded border border-border disabled:opacity-40 hover:bg-muted"
        >
          Next <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    ) : null
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className={btnCls} title="Copy voyage sheets from any workbook" aria-label="Copy voyage sheets">
        <Copy className={variant === "compact" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        <span className={variant === "compact" ? "hidden sm:inline" : ""}>Copy Sheets</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-2 sm:p-4" onClick={reset}>
          <div
            className="bg-card text-foreground rounded-lg shadow-2xl border border-border w-full max-w-4xl h-[calc(100dvh-1rem)] sm:h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold">Select Voyage Sheets to Copy</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Selected: <span className={`font-semibold ${canCopy ? "text-success" : "text-foreground"}`}>{selected.length}</span> / {MAX}
                </p>
              </div>
              <button onClick={reset} className="touch-icon-sm rounded hover:bg-muted" aria-label="Close copy sheets">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-[1fr_260px]">
              {/* Browser */}
              <div className="flex flex-col min-h-0 border-r border-border">
                {!workbook ? (
                  <>
                    <div className="p-3 border-b border-border">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search workbooks..."
                          value={wbSearch}
                          onChange={e => { setWbSearch(e.target.value); setWbPage(1); }}
                          className="form-input-sm w-full pl-8 h-8 text-xs"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 py-2">
                      {wbLoading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading workbooks...
                        </div>
                      ) : workbooks.length === 0 ? (
                        <div className="text-center py-10 text-xs text-muted-foreground">No workbooks found.</div>
                      ) : (
                        <ul className="space-y-1">
                          {workbooks.map(wb => (
                            <li
                              key={wb.id}
                              onClick={() => { setWorkbook({ id: wb.id, name: wb.name }); setShPage(1); setShSearch(""); }}
                              className="flex items-center gap-2 px-2.5 py-2 rounded border border-border text-xs cursor-pointer hover:bg-muted/50"
                            >
                              <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{wb.name}</div>
                                <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                  {wb.owner_email && <span className="truncate">{wb.owner_email}</span>}
                                  <span>{wb.sheet_count ?? 0} sheets</span>
                                </div>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Pager page={wbPage} pages={wbPages} onPage={setWbPage} />
                  </>
                ) : (
                  <>
                    <div className="p-3 border-b border-border space-y-2">
                      <button
                        onClick={() => { setWorkbook(null); setWbPage(1); }}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <ChevronLeft className="h-3 w-3" /> All workbooks
                      </button>
                      <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5" /> {workbook.name}
                      </div>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search sheets in this workbook..."
                          value={shSearch}
                          onChange={e => setShSearch(e.target.value)}
                          className="form-input-sm w-full pl-8 h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 py-2">
                      {shLoading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading sheets...
                        </div>
                      ) : filteredSheets.length === 0 ? (
                        <div className="text-center py-10 text-xs text-muted-foreground">No sheets found.</div>
                      ) : (
                        <ul className="space-y-1">
                          {filteredSheets.map(s => {
                            const checked = selected.some(p => p.id === s.id);
                            const disabled = !checked && selected.length >= MAX;
                            return (
                              <li
                                key={s.id}
                                onClick={() => !disabled && toggle(s)}
                                className={`flex items-center gap-2 px-2.5 py-2 rounded border text-xs transition-colors ${
                                  checked
                                    ? "border-primary bg-primary/5 cursor-pointer"
                                    : disabled
                                      ? "border-border opacity-50 cursor-not-allowed"
                                      : "border-border hover:bg-muted/50 cursor-pointer"
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
                                    {s.owner_email && <span className="truncate">{s.owner_email}</span>}
                                    <span>Updated {new Date(s.updated_at || s.created_at).toLocaleString()}</span>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    <Pager page={shPage} pages={shPages} onPage={setShPage} />
                  </>
                )}
              </div>

              {/* Selected panel */}
              <div className="hidden sm:flex flex-col min-h-0">
                <div className="px-3 py-2 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Selected sheets
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {selected.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground text-center py-8">
                      Pick 1–{MAX} sheets from any workbook to copy as your own editable sheets.
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {selected.map(s => (
                        <li key={s.id} className="flex items-start gap-1.5 px-2 py-1.5 rounded border border-border text-[11px]">
                          <FileText className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{s.name}</div>
                            {s.workbookName && <div className="text-[10px] text-muted-foreground truncate">{s.workbookName}</div>}
                          </div>
                          <button
                            onClick={() => setSelected(prev => prev.filter(p => p.id !== s.id))}
                            className="p-0.5 rounded hover:bg-muted"
                            title="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={reset} className="h-7 px-3 text-xs rounded border border-border hover:bg-muted">Cancel</button>
              <button
                onClick={handleCopy}
                disabled={!canCopy}
                className="h-7 px-4 text-xs rounded bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {copying && <Loader2 className="h-3 w-3 animate-spin" />}
                Copy ({selected.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
