import { useEffect, useCallback, useRef } from "react";
import { CompactHeader } from "@/components/voyage/CompactHeader";
import { SheetTabs } from "@/components/voyage/SheetTabs";
import { VesselPanel } from "@/components/voyage/VesselPanel";
import { SequenceTable } from "@/components/voyage/SequenceTable";
import { CargoSection } from "@/components/voyage/CargoSection";
import { BunkerSection } from "@/components/voyage/BunkerSection";
import { MiscSection } from "@/components/voyage/MiscSection";
import { SheetNotes } from "@/components/voyage/SheetNotes";
import { JsonImportSection } from "@/components/voyage/JsonImportSection";
import { VoyageSummary } from "@/components/voyage/VoyageSummary";
import { VoyageTimeline } from "@/components/voyage/VoyageTimeline";
import { useSheets } from "@/context/sheetContextCore";
import { useAuth } from "@/context/AuthContext";
import { useVoyageContext } from "@/context/VoyageContext";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const { activeTab, activeTabIndex, saveCurrentSheet, markDirty, updateTabData } = useSheets();
  const { user } = useAuth();
  const voyage = useVoyageContext();
  const { suppressDistanceRecalc, setDistanceSuppressed, resetState } = voyage;
  const isAdmin = user?.role === "admin";
  const isReadOnly = activeTab?.readOnly === true;

  // Track which tab id we last loaded to detect tab switches
  const lastLoadedTabRef = useRef<string | null | undefined>(undefined);
  // Track previous tab index to snapshot data before switching
  const prevTabIndexRef = useRef<number>(activeTabIndex);
  // Suppress dirty marking during hydration
  const isHydratingRef = useRef(false);

  // Gather current voyage data for saving
  const gatherData = useCallback((): Record<string, unknown> => ({
    vessel: voyage.vessel,
    sequence: voyage.sequence,
    cargos: voyage.cargos,
    bunker: voyage.bunker,
    misc: voyage.misc,
    hireRate: voyage.hireRate,
    vesselCost: voyage.vesselCost,
    netBB: voyage.netBB,
    applyEuaImpact: voyage.applyEuaImpact,
    applyFuelEuImpact: voyage.applyFuelEuImpact,
    applyUkEtsImpact: voyage.applyUkEtsImpact,
    departureUtc: voyage.departureUtc,
    autoDistanceEnabled: voyage.autoDistanceEnabled,
    notes: voyage.notes,
  }), [voyage.vessel, voyage.sequence, voyage.cargos, voyage.bunker, voyage.misc, voyage.hireRate, voyage.vesselCost, voyage.netBB, voyage.applyEuaImpact, voyage.applyFuelEuImpact, voyage.applyUkEtsImpact, voyage.autoDistanceEnabled, voyage.notes]);

  // Snapshot current voyage data back to the previous tab when switching tabs
  useEffect(() => {
    const prevIdx = prevTabIndexRef.current;
    if (prevIdx !== activeTabIndex && prevIdx >= 0) {
      // Save current voyage state into the previous tab's data (without marking dirty)
      const data = gatherData();
      updateTabData(prevIdx, data);
    }
    prevTabIndexRef.current = activeTabIndex;
  }, [activeTabIndex, gatherData, updateTabData]);

  // Suppress distance API while any tab is loading
  useEffect(() => {
    if (activeTab?.isLoading) {
      setDistanceSuppressed(true);
    }
  }, [activeTab?.isLoading, setDistanceSuppressed]);

  // Load sheet data into VoyageContext when a tab is opened with data
  // OR reset state for a brand new empty tab
  useEffect(() => {
    if (!activeTab || activeTab.isLoading) return;
    
    // Build a unique key for this tab instance
    const tabKey = activeTab.id ?? `new-${activeTab.name}`;
    if (lastLoadedTabRef.current === tabKey) return;
    lastLoadedTabRef.current = tabKey;

    isHydratingRef.current = true;

    if (activeTab.data && Object.keys(activeTab.data).length > 0) {
      // Existing sheet with data — hydrate
      const d = activeTab.data as Record<string, any>;
      suppressDistanceRecalc();
      if (d.vessel) voyage.setVessel(d.vessel);
      if (d.sequence) voyage.setSequence(d.sequence);
      if (d.cargos) voyage.setCargos(d.cargos);
      if (d.bunker) voyage.setBunker(d.bunker);
      if (d.misc) voyage.setMisc(d.misc);
      if (d.hireRate !== undefined) voyage.setHireRate(d.hireRate);
      if (d.vesselCost !== undefined) voyage.setVesselCost(d.vesselCost);
      if (d.netBB !== undefined) voyage.setNetBB(d.netBB);
      if (d.applyEuaImpact !== undefined) voyage.setApplyEuaImpact(d.applyEuaImpact);
      if (d.applyFuelEuImpact !== undefined) voyage.setApplyFuelEuImpact(d.applyFuelEuImpact);
      if (d.applyUkEtsImpact !== undefined) voyage.setApplyUkEtsImpact(d.applyUkEtsImpact);
      if (d.departureUtc !== undefined) voyage.setDepartureUtc(d.departureUtc as string);
      voyage.setAutoDistanceEnabled(d.autoDistanceEnabled === true);
      voyage.setNotes(typeof d.notes === "string" ? d.notes : "");
    } else {
      // New empty sheet — reset all state
      resetState();
    }

    // Allow React to flush state updates, then stop suppressing dirty
    requestAnimationFrame(() => {
      isHydratingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.name, activeTab?.isLoading]);

  // Listen for save events from SheetTabs
  useEffect(() => {
    const handler = (e: Event) => {
      const { name } = (e as CustomEvent).detail;
      if (voyage.hasErrors) {
        toast.warning(`Saved with ${voyage.validationIssues.length} validation issue(s)`, {
          description: "Sheet saved. Review flagged fields when ready.",
        });
      }
      const data = gatherData();
      saveCurrentSheet(name, data);
    };
    window.addEventListener("sheet-save", handler);
    return () => window.removeEventListener("sheet-save", handler);
  }, [gatherData, saveCurrentSheet, voyage.hasErrors, voyage.validationIssues.length]);

  // Mark dirty on any voyage change — but NOT during hydration
  useEffect(() => {
    if (activeTab && !activeTab.isLoading && !isHydratingRef.current) {
      markDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage.vessel, voyage.sequence, voyage.cargos, voyage.bunker, voyage.misc, voyage.hireRate, voyage.vesselCost, voyage.netBB, voyage.applyEuaImpact, voyage.applyFuelEuImpact, voyage.applyUkEtsImpact, voyage.departureUtc, voyage.notes]);

  if (activeTab?.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading sheet...</span>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden sheet-shell">
      {/* Header */}
      <CompactHeader />
      
      {/* Sheet Tabs */}
      <SheetTabs />

      {activeTab?.readOnly && (
        <div className="bg-warning/10 border-b border-warning/30 text-amber-700 dark:text-amber-300 px-4 py-1.5 text-[11px] flex items-center justify-between flex-shrink-0">
          <span>This sheet belongs to another user in your organization and is read-only. Use <strong>Copy Sheet</strong> to create your own editable copy.</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <div
          className={`flex-1 overflow-y-auto sheet-scroll p-3 space-y-2.5 ${
            isReadOnly ? "select-none [&_button]:pointer-events-none [&_input]:pointer-events-none [&_select]:pointer-events-none [&_textarea]:pointer-events-none [&_[role=button]]:pointer-events-none" : ""
          }`}
        >
          <VesselPanel />
          <SequenceTable />
          <CargoSection />
          <BunkerSection />
          <MiscSection />
          <SheetNotes />
          {isAdmin && !isReadOnly && <JsonImportSection />}
        </div>
        
        {/* Right Panel - Summary */}
        <div
          className={`w-80 flex-shrink-0 border-l border-[hsl(var(--dash-border))] overflow-y-auto sheet-scroll bg-[hsl(var(--dash-surface))] ${
            isReadOnly ? "select-none [&_button]:pointer-events-none [&_input]:pointer-events-none [&_select]:pointer-events-none [&_textarea]:pointer-events-none [&_[role=button]]:pointer-events-none" : ""
          }`}
        >
          <div className="p-2">
            <VoyageSummary />
            <div className="mt-2">
              <VoyageTimeline />
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="sheet-topbar border-t border-[hsl(var(--dash-border))] px-4 py-1.5 text-[10px] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-primary-foreground/80">
          <span>© 2026 VoyageCalc</span>
          <span className="opacity-40">|</span>
          <span>Session: {new Date().toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {!activeTab?.readOnly && <button
            className="bg-white/15 hover:bg-white/25 text-primary-foreground px-3 py-1 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1"
            onClick={() => {
              if (activeTab) {
                window.dispatchEvent(new CustomEvent("sheet-save", { detail: { name: activeTab.name } }));
              }
            }}
          >
            Save Sheet
          </button>}
        </div>
      </footer>
    </div>
  );
};

export default Index;
