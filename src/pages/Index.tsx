import { useEffect, useCallback, useRef, useState, type SyntheticEvent } from "react";
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
import { SectionFrame } from "@/components/voyage/SectionFrame";
import { useSheets } from "@/context/sheetContextCore";
import { useAuth } from "@/context/AuthContext";
import { useVoyageContext } from "@/context/VoyageContext";
import { Calculator, Loader2, PanelRightClose, PanelRightOpen, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const { activeTab, activeTabIndex, saveCurrentSheet, deleteCurrentSheet, markDirty, markClean, updateTabData, registerDataGetter } = useSheets();
  const { user } = useAuth();
  const voyage = useVoyageContext();
  const { suppressDistanceRecalc, setDistanceSuppressed, resetState } = voyage;
  const isAdmin = user?.role === "admin";
  const isReadOnly = activeTab?.readOnly === true;
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1024,
  );
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    // Only force the summary open when crossing up into desktop widths; a user
    // who collapsed it manually keeps their choice.
    const handleBreakpoint = (event: MediaQueryListEvent) => {
      if (event.matches) setSidebarOpen(true);
    };
    media.addEventListener("change", handleBreakpoint);
    return () => media.removeEventListener("change", handleBreakpoint);
  }, []);


  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const handleMobile = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
      if (!event.matches) setMobileSummaryOpen(false);
    };
    media.addEventListener("change", handleMobile);
    return () => media.removeEventListener("change", handleMobile);
  }, []);

  const guardReadOnlyEdit = useCallback((event: SyntheticEvent<HTMLElement>) => {
    if (!isReadOnly) return;
    const target = event.target as HTMLElement;
    const interactive = target.closest("button, input, select, textarea, [role='button'], [contenteditable='true']") as HTMLElement | null;
    if (!interactive || interactive.closest("[data-readonly-allowed='true']")) return;
    event.preventDefault();
    event.stopPropagation();
  }, [isReadOnly]);

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
    charterer: voyage.charterer,
  }), [voyage.vessel, voyage.sequence, voyage.cargos, voyage.bunker, voyage.misc, voyage.hireRate, voyage.vesselCost, voyage.netBB, voyage.applyEuaImpact, voyage.applyFuelEuImpact, voyage.applyUkEtsImpact, voyage.autoDistanceEnabled, voyage.notes, voyage.charterer]);

  // Let the sheet manager read current values for auto-save on leave
  const gatherRef = useRef(gatherData);
  gatherRef.current = gatherData;
  useEffect(() => {
    registerDataGetter(() => gatherRef.current());
    return () => registerDataGetter(null);
  }, [registerDataGetter]);

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
    // A saved sheet whose payload hasn't arrived yet: wait for it instead of
    // clearing the editor and locking this tab as "already loaded".
    const hasData = !!activeTab.data && Object.keys(activeTab.data).length > 0;
    if (activeTab.id && !hasData) return;
    lastLoadedTabRef.current = tabKey;

    isHydratingRef.current = true;

    if (activeTab.data && Object.keys(activeTab.data).length > 0) {
      // Existing sheet with data — clear any leftover state from the previously
      // opened sheet first, then hydrate only this sheet's saved values.
      const d = activeTab.data as Record<string, any>;
      suppressDistanceRecalc();
      resetState();
      if (d.vessel) voyage.setVessel(d.vessel);
      if (d.sequence) voyage.setSequence(d.sequence);
      if (d.cargos) voyage.setCargos(d.cargos);
      if (d.bunker) voyage.setBunker(d.bunker);
      if (d.misc) {
        // Only hydrate fields that still exist — legacy entries (canal 2, idle
        // port, extra sailing time) in older saved sheets are ignored.
        const m = d.misc as Record<string, any>;
        voyage.setMisc((prev) => ({
          ...prev,
          miscCost: Number(m.miscCost) || 0,
          extraFees: Number(m.extraFees) || 0,
          extraInsurance: Number(m.extraInsurance) || 0,
          canalCost1: Number(m.canalCost1) || 0,
          canalFuel: m.canalFuel ?? prev.canalFuel,
          extraTime: {
            canal1: { ...prev.extraTime.canal1, ...(m.extraTime?.canal1 ?? {}) },
          },
        }));
      }
      voyage.setHireRate(d.hireRate ?? 0);
      voyage.setVesselCost(d.vesselCost ?? 0);
      voyage.setNetBB(d.netBB ?? 0);
      voyage.setApplyEuaImpact(d.applyEuaImpact === true);
      voyage.setApplyFuelEuImpact(d.applyFuelEuImpact === true);
      voyage.setApplyUkEtsImpact(d.applyUkEtsImpact === true);
      if (d.departureUtc !== undefined) voyage.setDepartureUtc(d.departureUtc as string);
      voyage.setAutoDistanceEnabled(d.autoDistanceEnabled === true);
      voyage.setNotes(typeof d.notes === "string" ? d.notes : "");
      voyage.setCharterer(typeof d.charterer === "string" ? d.charterer : "");
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
      const { name, workbookId } = (e as CustomEvent).detail as { name: string; workbookId?: string | null };
      if (voyage.hasErrors) {
        toast.warning(`Saved with ${voyage.validationIssues.length} validation issue(s)`, {
          description: "Sheet saved. Review flagged fields when ready.",
        });
      }
      const data = gatherData();
      saveCurrentSheet(name, data, workbookId);
    };
    window.addEventListener("sheet-save", handler);
    return () => window.removeEventListener("sheet-save", handler);
  }, [gatherData, saveCurrentSheet, voyage.hasErrors, voyage.validationIssues.length]);

  // Unsaved-changes tracking: compare current values against a baseline
  // snapshot taken after the sheet finishes loading (and after each save).
  // Automatic recalculations in the first moments after opening update the
  // baseline instead of marking the sheet as changed.
  const baselineRef = useRef<string | null>(null);
  const settleUntilRef = useRef(0);
  useEffect(() => {
    baselineRef.current = null;
    settleUntilRef.current = Date.now() + 2500;
  }, [activeTab?.id, activeTab?.name, activeTab?.isLoading]);
  useEffect(() => {
    // After a successful save (tab no longer dirty and has an id), re-baseline
    if (activeTab && !activeTab.isDirty) {
      baselineRef.current = JSON.stringify(gatherData());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.isDirty, activeTab?.id]);

  useEffect(() => {
    if (!activeTab || activeTab.isLoading || isHydratingRef.current) return;
    const snap = JSON.stringify(gatherData());
    if (baselineRef.current === null || Date.now() < settleUntilRef.current) {
      baselineRef.current = snap;
      if (activeTab.isDirty && activeTab.id) markClean();
      return;
    }
    if (snap === baselineRef.current) {
      if (activeTab.isDirty) markClean();
    } else {
      markDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage.vessel, voyage.sequence, voyage.cargos, voyage.bunker, voyage.misc, voyage.hireRate, voyage.vesselCost, voyage.netBB, voyage.applyEuaImpact, voyage.applyFuelEuImpact, voyage.applyUkEtsImpact, voyage.departureUtc, voyage.notes, voyage.charterer]);

  if (activeTab?.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading sheet...</span>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden sheet-shell sheet-density">
      {/* Header */}
      <CompactHeader />
      
      {/* Sheet Tabs */}
      <SheetTabs />

      {activeTab?.readOnly && (
        <div className="bg-warning/10 border-b border-warning/30 text-amber-700 dark:text-amber-300 px-4 py-1.5 text-[11px] flex items-center justify-between flex-shrink-0">
          <span>This sheet belongs to another user in your organization and is read-only. Use <strong>Copy Sheet</strong> to create your own editable copy.</span>
        </div>
      )}

      {isMobile && (
        <div className="grid grid-cols-2 gap-1 border-b border-[hsl(var(--dash-border))] bg-[hsl(var(--dash-surface))] p-1.5">
          <button type="button" data-readonly-allowed="true" onClick={() => setMobileSummaryOpen(false)} className={`mobile-view-toggle ${!mobileSummaryOpen ? "mobile-view-toggle-active" : ""}`} aria-pressed={!mobileSummaryOpen}>
            <Calculator className="h-4 w-4" /> Calculator
          </button>
          <button type="button" data-readonly-allowed="true" onClick={() => setMobileSummaryOpen(true)} className={`mobile-view-toggle ${mobileSummaryOpen ? "mobile-view-toggle-active" : ""}`} aria-pressed={mobileSummaryOpen}>
            <TrendingUp className="h-4 w-4" /> Voyage Summary
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Panel */}
        <div
          className={`${isMobile && mobileSummaryOpen ? "hidden" : "block"} flex-1 min-w-0 overflow-y-auto sheet-scroll p-1.5 sm:p-2 space-y-2 ${isReadOnly ? "read-only-surface" : ""}`}
          onClickCapture={guardReadOnlyEdit}
          onChangeCapture={guardReadOnlyEdit}
          onInputCapture={guardReadOnlyEdit}
          onKeyDownCapture={guardReadOnlyEdit}
        >
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,4fr)_minmax(240px,1fr)] gap-2 items-stretch">
            <SectionFrame title="Vessel" className="min-w-0"><VesselPanel /></SectionFrame>
            <SectionFrame title="Miscellaneous" className="min-w-0"><MiscSection /></SectionFrame>
          </div>
          <SectionFrame title="Sequence" className="min-w-0"><SequenceTable /></SectionFrame>
          <SectionFrame title="Cargo"><CargoSection /></SectionFrame>
          <SectionFrame title="Bunker"><BunkerSection /></SectionFrame>
          <SectionFrame title="Notes"><SheetNotes /></SectionFrame>
          {isAdmin && !isReadOnly && <JsonImportSection />}
        </div>
        
        {/* Right Panel - Summary (collapsible) */}
        <div className={`${isMobile ? (mobileSummaryOpen ? "flex w-full" : "hidden") : "flex"} relative flex-shrink-0 border-l border-[hsl(var(--dash-border))] bg-[hsl(var(--dash-surface))] flex-col`}>
          {(isMobile ? mobileSummaryOpen : sidebarOpen) ? (
            <div
              className={`${isMobile ? "w-full" : "w-64 xl:w-72 2xl:w-80"} flex-1 overflow-y-auto sheet-scroll ${isReadOnly ? "read-only-surface" : ""}`}
              onClickCapture={guardReadOnlyEdit}
              onChangeCapture={guardReadOnlyEdit}
              onInputCapture={guardReadOnlyEdit}
              onKeyDownCapture={guardReadOnlyEdit}
            >
              <div className="p-1.5 space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Summary</span>
                  <button
                    type="button"
                    data-readonly-allowed="true"
                    onClick={() => isMobile ? setMobileSummaryOpen(false) : setSidebarOpen(false)}
                    title="Collapse summary"
                    aria-label="Collapse summary"
                    className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                  >
                    <PanelRightClose className="h-3.5 w-3.5" />
                  </button>
                </div>
                <VoyageSummary />
                <VoyageTimeline />
              </div>
            </div>
          ) : !isMobile ? (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              title="Expand summary"
              aria-label="Expand summary"
              className="w-7 h-full flex items-start justify-center pt-2 hover:bg-muted transition-colors"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      
      {/* Footer */}
      <footer className="sheet-topbar border-t border-[hsl(var(--dash-border))] px-2 sm:px-4 py-1 text-[10px] flex items-center justify-end sm:justify-between flex-shrink-0">
        <div className="hidden sm:flex items-center gap-2 text-primary-foreground/80">
          <span>© 2026 VoyageCalc</span>
          <span className="opacity-40">|</span>
          <span>Session: {new Date().toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {activeTab && !activeTab.readOnly && (
            <button
              className="bg-destructive/80 hover:bg-destructive text-destructive-foreground px-3 py-1 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1"
              onClick={deleteCurrentSheet}
              title="Delete Sheet"
            >
              <Trash2 className="h-3 w-3" />
              <span>Delete Sheet</span>
            </button>
          )}
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
