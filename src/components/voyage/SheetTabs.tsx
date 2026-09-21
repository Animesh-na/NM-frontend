import { X, ArrowLeft, Save, Copy, Calculator, Plus } from "lucide-react";
import { useSheets } from "@/context/sheetContextCore";
import { useEffect, useRef, useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";
import { IntakeCalculator } from "./IntakeCalculator";
import { trackEvent } from "@/services/logger";
import { listWorkbooks, type WorkbookItem } from "@/services/marineApi";
import { getApiMode, API_MODE_CHANGED_EVENT } from "@/services/apiMode";

export function SheetTabs() {
  const { tabs, activeTabIndex, setActiveTabIndex, closeTab, goToDashboard, saveCurrentSheet, activeTab, copyCurrentSheet, createNewSheet } = useSheets();
  const [savingName, setSavingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [workbooks, setWorkbooks] = useState<WorkbookItem[]>([]);
  const [workbookId, setWorkbookId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep the active tab visible in the horizontal scroll strip
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabIndex, tabs.length]);

  useEffect(() => {
    if (!savingName) return;
    let cancelled = false;
    listWorkbooks(1, 100).then(res => { if (!cancelled) setWorkbooks(res.workbooks || []); });
    return () => { cancelled = true; };
  }, [savingName]);
  const { sequence, vessel, cargos = [], updateSequenceRow } = useVoyageContext();
  const [sectorMode, setSectorMode] = useState(getApiMode());
  useEffect(() => {
    const onModeChange = () => setSectorMode(getApiMode());
    window.addEventListener(API_MODE_CHANGED_EVENT, onModeChange);
    return () => window.removeEventListener(API_MODE_CHANGED_EVENT, onModeChange);
  }, []);
  const isTanker = sectorMode === "tanker";

  const handleSave = () => {
    if (!activeTab) return;
    trackEvent("sheet.save.open", { component: "SheetTabs", sheet_id: activeTab.id, sheet_name: activeTab.name });
    setSavingName(true);
    setEditName(activeTab.name);
    setWorkbookId(activeTab.workbookId || "");
  };

  const confirmSave = () => {
    // We'll pass an empty data object; the actual VoyageContext data will be gathered by the parent
    setSavingName(false);
    trackEvent("sheet.save.confirm", { component: "SheetTabs", sheet_id: activeTab?.id, sheet_name: editName });
    // Dispatch custom event so Index page can handle the save with full context data
    window.dispatchEvent(new CustomEvent("sheet-save", { detail: { name: editName, workbookId: workbookId || null } }));
  };

  return (
    <div className="bg-[hsl(var(--dash-surface))] border-b border-[hsl(var(--dash-border))] flex flex-wrap items-center min-h-9 text-[11px] px-1.5 sm:px-2.5 py-0.5 gap-1.5 flex-shrink-0 shadow-sm">
      {/* Back to Dashboard */}
      <button
        onClick={goToDashboard}
        className="touch-icon flex items-center justify-center rounded-lg border border-[hsl(var(--dash-border))] hover:bg-[hsl(var(--dash-bg))] text-muted-foreground transition-colors mr-0.5"
        title="Back to Dashboard"
        aria-label="Back to dashboard"
      >
        <ArrowLeft className="h-3 w-3" />
      </button>

      {/* Tabs */}
      <div ref={scrollRef} className="order-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto sheet-scroll">
      {tabs.map((tab, idx) => (
        <div
          key={tab.id || `new-${idx}`}
          ref={idx === activeTabIndex ? activeTabRef : undefined}
          className={`flex items-center gap-1.5 min-h-9 sm:min-h-6 px-2.5 rounded-lg cursor-pointer border transition-all max-w-[170px] flex-shrink-0 ${
            idx === activeTabIndex
              ? "bg-[hsl(var(--ocean))] border-transparent text-primary-foreground font-semibold shadow-sm"
              : "bg-[hsl(var(--dash-bg))] border-[hsl(var(--dash-border))] text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTabIndex(idx)}
        >
          <span className="truncate">{tab.name}</span>
          {tab.isDirty && <span className="text-warning">●</span>}
          <button
            onClick={(e) => { e.stopPropagation(); closeTab(idx); }}
            className="touch-icon-sm hover:bg-destructive/25 rounded-md ml-0.5"
            aria-label={`Close ${tab.name}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
      </div>

      <div className="order-3 basis-full sm:order-none sm:basis-auto flex items-center gap-1.5 overflow-x-auto sheet-scroll sm:ml-auto">
      {/* Copy Sheet Button */}
      {activeTab && (
        <button
          onClick={copyCurrentSheet}
          className="sheet-action-button border border-[hsl(var(--dash-border))] bg-[hsl(var(--dash-surface))] text-foreground hover:bg-[hsl(var(--dash-bg))]"
          title="Copy Sheet"
        >
          <Copy className="h-3 w-3" />
          <span>Copy Sheet</span>
        </button>
      )}


      {/* New Sheet in current workbook */}
      {activeTab?.workbookId && (
        <button
          onClick={() => createNewSheet(activeTab.workbookId, activeTab.workbookName)}
          className="sheet-action-button bg-[hsl(var(--ocean))] text-primary-foreground hover:bg-[hsl(var(--ocean-600))]"
          title={`New sheet in ${activeTab.workbookName || "this workbook"}`}
        >
          <Plus className="h-3 w-3" />
          <span>New Sheet</span>
        </button>
      )}

      {/* Intake Calculator + Save */}
      <div className="flex items-center gap-1.5">
        {!isTanker && (
          <button
            onClick={() => { trackEvent("intake.open", { component: "SheetTabs", vessel: vessel?.name }); setIntakeOpen(true); }}
            className="sheet-action-button bg-[hsl(var(--teal))] text-[hsl(var(--teal-foreground))] hover:opacity-90"
            title="Intake Calculator"
          >
            <Calculator className="h-3 w-3" />
            <span>Intake Calculator</span>
          </button>
        )}

        {activeTab && !activeTab.readOnly && (
          savingName ? (
            <div className="flex items-center gap-1.5">
              <input
                className="form-input-sm w-32"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirmSave()}
                autoFocus
              />
              <select
                className="form-input-sm w-36"
                value={workbookId}
                onChange={e => setWorkbookId(e.target.value)}
                title="Workbook"
              >
                <option value="">No workbook</option>
                {workbooks.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <button onClick={confirmSave} className="btn-primary h-5 px-2.5 text-[10px]">OK</button>
              <button onClick={() => setSavingName(false)} className="btn-secondary h-5 px-2.5 text-[10px]">Cancel</button>
            </div>
          ) : (
            <button
              onClick={handleSave}
              className="sheet-action-button bg-[hsl(var(--ocean))] text-primary-foreground hover:bg-[hsl(var(--ocean-600))]"
              title="Save Sheet"
            >
              <Save className="h-3 w-3" />
              <span>Save</span>
            </button>
          )
        )}

        {activeTab?.readOnly && (
          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-semibold uppercase tracking-wide">
            Read-only · Organization sheet
          </span>
        )}
      </div>
      </div>

      {intakeOpen && !isTanker && (
        <IntakeCalculator
          open
          onClose={() => setIntakeOpen(false)}
          vessel={vessel}
          ports={sequence.map((r) => ({
            id: r.id,
            name: r.port,
            draft: r.portMaxDraft || r.draft || 0,
            operation: r.operation,
            kind: r.type,
          }))}
          stowageFactor={Math.round((cargos[0]?.stowageFactor || 1.4) * 35.3147)}
          onApply={(qty, portResults) => {
            trackEvent("intake.apply", {
              component: "IntakeCalculator",
              vessel: vessel?.name,
              quantity: qty,
              ports_updated: portResults.length,
            });
            portResults.forEach((p) => {
              updateSequenceRow(p.id, "portMaxDraft", p.draft);
              updateSequenceRow(p.id, "draft", p.draft);
            });
            const firstLoad = sequence.find((r) => r.operation === "loading");
            if (firstLoad) updateSequenceRow(firstLoad.id, "quantity", qty);
            setIntakeOpen(false);
          }}
        />
      )}
    </div>
  );
}
