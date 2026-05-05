import { X, ArrowLeft, Save, Plus, Copy } from "lucide-react";
import { useSheets } from "@/context/SheetContext";
import { useState } from "react";

export function SheetTabs() {
  const { tabs, activeTabIndex, setActiveTabIndex, closeTab, goToDashboard, saveCurrentSheet, activeTab, createNewSheet, copyCurrentSheet } = useSheets();
  const [savingName, setSavingName] = useState(false);
  const [editName, setEditName] = useState("");

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
    <div className="bg-card border-b border-border flex items-center h-8 text-[11px] px-2 gap-1 flex-shrink-0">
      {/* Back to Dashboard */}
      <button
        onClick={goToDashboard}
        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm hover:bg-background text-muted-foreground transition-colors mr-1"
        title="Back to Dashboard"
      >
        <ArrowLeft className="h-3 w-3" />
      </button>

      {/* Tabs */}
      {tabs.map((tab, idx) => (
        <div
          key={tab.id || `new-${idx}`}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-t-sm cursor-pointer border border-b-0 transition-colors max-w-[160px] ${
            idx === activeTabIndex
              ? "bg-background border-border text-foreground"
              : "bg-muted border-transparent text-muted-foreground hover:bg-background/50"
          }`}
          onClick={() => setActiveTabIndex(idx)}
        >
          <span className="truncate">{tab.name}</span>
          {tab.isDirty && <span className="text-warning">●</span>}
          <button
            onClick={(e) => { e.stopPropagation(); closeTab(idx); }}
            className="hover:bg-destructive/20 rounded-sm p-0.5 ml-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}

      {/* Copy Sheet Button */}
      {activeTab && (
        <button
          onClick={copyCurrentSheet}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/85 transition-colors ml-1 text-[10px] font-medium"
          title="Copy Sheet"
        >
          <Copy className="h-3 w-3" />
          <span>Copy Sheet</span>
        </button>
      )}

      {/* New Sheet Button */}
      <button
        onClick={createNewSheet}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/85 transition-colors ml-1 text-[10px] font-medium"
        title="New Sheet"
      >
        <Plus className="h-3 w-3" />
        <span>New Sheet</span>
      </button>

      {/* Save Button */}
      {activeTab && (
        <div className="ml-auto flex items-center gap-1.5">
          {savingName ? (
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
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/85 transition-colors text-[10px] font-medium"
              title="Save Sheet"
            >
              <Save className="h-3 w-3" />
              <span>Save</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
