import { useEffect, useCallback } from "react";
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
import { useSheets } from "@/context/SheetContext";
import { useVoyageContext } from "@/context/VoyageContext";
import { Loader2 } from "lucide-react";

const Index = () => {
  const { activeTab, saveCurrentSheet, markDirty } = useSheets();
  const voyage = useVoyageContext();
  const { suppressDistanceRecalc, setDistanceSuppressed, resetState } = voyage;

  // Track which tab id we last loaded to detect tab switches
  const lastLoadedTabRef = useRef<string | null | undefined>(undefined);

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
    } else {
      // New empty sheet — reset all state
      resetState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.name, activeTab?.isLoading]);

  // Gather current voyage data for saving
  const gatherData = useCallback((): Record<string, unknown> => ({
    vessel: voyage.vessel,
    sequence: voyage.sequence,
    cargos: voyage.cargos,
    bunker: voyage.bunker,
    misc: voyage.misc,
    hireRate: voyage.hireRate,
    vesselCost: voyage.vesselCost,
  }), [voyage.vessel, voyage.sequence, voyage.cargos, voyage.bunker, voyage.misc, voyage.hireRate, voyage.vesselCost]);

  // Listen for save events from SheetTabs
  useEffect(() => {
    const handler = (e: Event) => {
      const { name } = (e as CustomEvent).detail;
      const data = gatherData();
      saveCurrentSheet(name, data);
    };
    window.addEventListener("sheet-save", handler);
    return () => window.removeEventListener("sheet-save", handler);
  }, [gatherData, saveCurrentSheet]);

  // Mark dirty on any voyage change (debounced by React batching)
  useEffect(() => {
    if (activeTab && !activeTab.isLoading) {
      markDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage.vessel, voyage.sequence, voyage.cargos, voyage.bunker, voyage.misc, voyage.hireRate, voyage.vesselCost]);

  if (activeTab?.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading sheet...</span>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <CompactHeader />
      
      {/* Sheet Tabs */}
      <SheetTabs />
      
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          <VesselPanel />
          <SequenceTable />
          <CargoSection />
          <BunkerSection />
          <MiscSection />
          <SheetNotes />
          <JsonImportSection />
        </div>
        
        {/* Right Panel - Summary */}
        <div className="w-72 flex-shrink-0 border-l border-border overflow-y-auto bg-background">
          <div className="p-2">
            <VoyageSummary />
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="bg-section-header border-t border-border px-3 py-1 text-[10px] text-muted-foreground flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span>© 2026 VoyageCalc</span>
          <span className="text-muted-foreground/50">|</span>
          <span>Session: {new Date().toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-primary">Apply</button>
          <button className="btn-success">Calculate</button>
          <button className="btn-secondary">Back</button>
          <button className="btn-danger">Close</button>
        </div>
      </footer>
    </div>
  );
};

export default Index;
