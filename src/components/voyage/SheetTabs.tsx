import { X, ArrowLeft, Save, Plus, Copy, Calculator } from "lucide-react";
import { useSheets } from "@/context/sheetContextCore";
import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";
import { IntakeCalculator } from "./IntakeCalculator";

export function SheetTabs() {
  const { tabs, activeTabIndex, setActiveTabIndex, closeTab, goToDashboard, saveCurrentSheet, activeTab, createNewSheet, copyCurrentSheet } = useSheets();
  const [savingName, setSavingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const { sequence, vessel, cargos = [], updateSequenceRow } = useVoyageContext();

  const handleSave = () => {
    if (!activeTab) return;
    setSavingName(true);
    setEditName(activeTab.name);
  };

  const confirmSave = () => {
    // We'll pass an empty data object; the actual VoyageContext data will be gathered by the parent
    setSavingName(false);
    // Dispatch custom event so Index page can handle the save with full context data
    window.dispatchEvent(new CustomEvent("sheet-save", { detail: { name: editName } }));
  };

  return (
    <div className="bg-[hsl(var(--dash-surface))] border-b border-[hsl(var(--dash-border))] flex items-center h-10 text-[11px] px-2.5 gap-1.5 flex-shrink-0 shadow-sm">
      {/* Back to Dashboard */}
      <button
        onClick={goToDashboard}
        className="flex items-center justify-center h-7 w-7 rounded-lg border border-[hsl(var(--dash-border))] hover:bg-[hsl(var(--dash-bg))] text-muted-foreground transition-colors mr-0.5"
        title="Back to Dashboard"
      >
        <ArrowLeft className="h-3 w-3" />
      </button>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto sheet-scroll">
      {tabs.map((tab, idx) => (
        <div
          key={tab.id || `new-${idx}`}
          className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg cursor-pointer border transition-all max-w-[170px] flex-shrink-0 ${
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
            className="hover:bg-destructive/25 rounded-md p-0.5 ml-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
      </div>

      {/* Copy Sheet Button */}
      {activeTab && (
        <button
          onClick={copyCurrentSheet}
          className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[hsl(var(--dash-border))] bg-[hsl(var(--dash-surface))] text-foreground hover:bg-[hsl(var(--dash-bg))] transition-colors ml-1 text-[10px] font-semibold flex-shrink-0"
          title="Copy Sheet"
        >
          <Copy className="h-3 w-3" />
          <span>Copy Sheet</span>
        </button>
      )}

      {/* New Sheet Button */}
      <button
        onClick={createNewSheet}
        className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-[hsl(var(--teal))] text-[hsl(var(--teal-foreground))] hover:opacity-90 transition-opacity ml-0.5 text-[10px] font-semibold flex-shrink-0"
        title="New Sheet"
      >
        <Plus className="h-3 w-3" />
        <span>New Sheet</span>
      </button>

      {/* Intake Calculator + Save */}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => setIntakeOpen(true)}
          className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-[hsl(var(--teal))] text-[hsl(var(--teal-foreground))] hover:opacity-90 transition-opacity text-[10px] font-semibold flex-shrink-0"
          title="Intake Calculator"
        >
          <Calculator className="h-3 w-3" />
          <span>Intake Calculator</span>
        </button>

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
              <button onClick={confirmSave} className="btn-primary h-5 px-2.5 text-[10px]">OK</button>
              <button onClick={() => setSavingName(false)} className="btn-secondary h-5 px-2.5 text-[10px]">Cancel</button>
            </div>
          ) : (
            <button
              onClick={handleSave}
              className="flex items-center gap-1 h-7 px-3 rounded-lg bg-[hsl(var(--ocean))] text-primary-foreground hover:bg-[hsl(var(--ocean-600))] transition-colors text-[10px] font-semibold"
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

      {intakeOpen && (
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
