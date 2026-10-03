import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { SheetContext, type SheetTab } from "@/context/sheetContextCore";
import { getSheet, saveSheet, updateSheet, deleteSheet, SheetSaveConflict, type SheetDetail } from "@/services/marineApi";

/** Tells the user a save was refused because the sheet changed elsewhere (D-059). */
function reportSaveConflict(err: SheetSaveConflict, name: string, overwrite: () => Promise<void>) {
  if (err.code === "LEASE_HELD") {
    toast.error(`"${name}" is being edited in another tab or device; it was not saved here.`);
    return;
  }
  toast.error(`"${name}" was saved elsewhere since you opened it${err.currentVersion ? ` (now version ${err.currentVersion})` : ""}. Your changes are kept.`, {
    duration: 15000,
    action: { label: "Overwrite with mine", onClick: () => void overwrite() },
  });
}
import { toast } from "@/components/ui/sonner";
import { logger, trackEvent, trackView } from "@/services/logger";
import type { DashSection } from "@/components/dashboard/DashboardSidebar";

export function SheetProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<"dashboard" | "editor" | "admin" | "compare">("dashboard");
  const [returnSection, setReturnSection] = useState<DashSection | null>(null);
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [compareSheetIds, setCompareSheetIds] = useState<string[]>([]);

  const openCompare = useCallback((ids: string[]) => {
    trackEvent("compare.open", { component: "SheetContext", sheet_count: ids.length, sheet_ids: ids });
    setCompareSheetIds(ids);
    setCurrentView("compare");
  }, []);

  const activeTab = tabs.length > 0 ? tabs[activeTabIndex] || null : null;

  const createNewSheet = useCallback((workbookId?: string | null, workbookName?: string | null) => {
    logger.info("Sheet created (blank)", { component: "SheetContext" });
    const newTab: SheetTab = {
      id: null,
      name: `New Sheet ${tabs.length + 1}`,
      data: {},
      isDirty: false,
      isLoading: false,
      workbookId: workbookId ?? null,
      workbookName: workbookName ?? null,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabIndex(tabs.length); // will be the new last index
    setCurrentView("editor");
  }, [tabs.length]);

  const copyCurrentSheet = useCallback(() => {
    const current = tabs[activeTabIndex];
    if (!current) return;
    trackEvent("sheet.copy", {
      component: "SheetContext",
      source_sheet_id: current.id,
      source_sheet_name: current.name,
      source_read_only: !!current.readOnly,
    });
    const copiedTab: SheetTab = {
      id: null,
      name: `${current.name} (Copy)`,
      data: JSON.parse(JSON.stringify(current.data)),
      isDirty: true,
      isLoading: false,
      readOnly: false,
      workbookId: current.workbookId ?? null,
      workbookName: current.workbookName ?? null,
    };
    setTabs(prev => [...prev, copiedTab]);
    setActiveTabIndex(tabs.length);
    setCurrentView("editor");
  }, [tabs, activeTabIndex]);

  const copySheets = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const existing = new Set(tabs.map(t => t.id));
    const copies: SheetTab[] = [];
    for (const id of ids) {
      if (existing.has(id)) {
        // Already open — copy from in-memory data instead of refetching
        const open = tabs.find(t => t.id === id);
        if (open) {
          copies.push({
            id: null,
            name: `${open.name} (Copy)`,
            data: JSON.parse(JSON.stringify(open.data)),
            isDirty: true,
            isLoading: false,
            readOnly: false,
            workbookId: open.workbookId ?? null,
            workbookName: open.workbookName ?? null,
          });
          continue;
        }
      }
      const detail = await getSheet(id);
      if (!detail) {
        toast.error("Failed to copy a sheet.");
        continue;
      }
      copies.push({
        id: null,
        name: `${detail.name} (Copy)`,
        data: detail.data || {},
        isDirty: true,
        isLoading: false,
        readOnly: false,
        workbookId: (detail as { workbook_id?: string | null }).workbook_id ?? null,
        workbookName: null,
      });
    }
    if (copies.length === 0) return;
    trackEvent("sheet.copy_multi", { component: "SheetContext", count: copies.length });
    setTabs(prev => {
      setActiveTabIndex(prev.length); // first copied tab
      return [...prev, ...copies];
    });
    setCurrentView("editor");
    toast.success(`${copies.length} sheet${copies.length > 1 ? "s" : ""} copied.`);
  }, [tabs]);

  const openSheet = useCallback(async (id: string, name: string) => {
    logger.info("Sheet opened", { component: "SheetContext", sheet_id: id, sheet_name: name });
    // Check if already open
    setTabs(prev => {
      const existingIdx = prev.findIndex(t => t.id === id);
      if (existingIdx >= 0) {
        setActiveTabIndex(existingIdx);
        setCurrentView("editor");
        return prev;
      }
      // Add loading tab
      const loadingTab: SheetTab = {
        id,
        name,
        data: {},
        isDirty: false,
        isLoading: true,
      };
      const newIndex = prev.length;
      setActiveTabIndex(newIndex);
      setCurrentView("editor");
      return [...prev, loadingTab];
    });

    // Fetch data
    try {
      const detail = await getSheet(id);
      if (detail) {
        setTabs(prev => prev.map(t => t.id === id ? { ...t, data: detail.data || {}, version: detail.version ?? null, isLoading: false } : t));
      } else {
        toast.error("Failed to load sheet data");
        setTabs(prev => prev.map(t => t.id === id ? { ...t, isLoading: false } : t));
      }
    } catch {
      toast.error("Failed to load sheet");
      setTabs(prev => prev.map(t => t.id === id ? { ...t, isLoading: false } : t));
    }
  }, []);

  const openOrganizationSheet = useCallback(async (id: string, name: string) => {
    logger.info("Organization sheet opened", { component: "SheetContext", sheet_id: id, sheet_name: name });
    // Open an organization sheet as a read-only tab. We use a synthetic tab id
    // (prefixed with "org:") so it can't collide with an editable sheet of the
    // same id and so save/update calls won't accidentally overwrite the original.
    const tabKey = `org:${id}`;
    setTabs(prev => {
      const existingIdx = prev.findIndex(t => t.id === tabKey);
      if (existingIdx >= 0) {
        setActiveTabIndex(existingIdx);
        setCurrentView("editor");
        return prev;
      }
      const loadingTab: SheetTab = {
        id: tabKey,
        name: `${name} (Read-only)`,
        data: {},
        isDirty: false,
        isLoading: true,
        readOnly: true,
      };
      const newIndex = prev.length;
      setActiveTabIndex(newIndex);
      setCurrentView("editor");
      return [...prev, loadingTab];
    });

    try {
      const detail = await getSheet(id);
      if (detail) {
        setTabs(prev => prev.map(t => t.id === tabKey ? { ...t, data: detail.data || {}, version: detail.version ?? null, isLoading: false } : t));
      } else {
        toast.error("Failed to load organization sheet");
        setTabs(prev => prev.map(t => t.id === tabKey ? { ...t, isLoading: false } : t));
      }
    } catch {
      toast.error("Failed to load organization sheet");
      setTabs(prev => prev.map(t => t.id === tabKey ? { ...t, isLoading: false } : t));
    }
  }, []);

  const openSheets = useCallback((
    incoming: { id: string; name: string; data?: Record<string, unknown>; version?: number | null; readOnly?: boolean; workbookId?: string | null; workbookName?: string | null }[],
    emptyWorkbook?: { id: string; name: string }
  ) => {
    if (!incoming.length && !emptyWorkbook) return;

    trackEvent("workbook.open", { component: "SheetContext", sheet_count: incoming.length });
    const hasPayload = (d: unknown) =>
      !!d && typeof d === "object" && Object.keys(d as Record<string, unknown>).length > 0;
    const next: SheetTab[] = [];
    for (const s of incoming) {
      const tabKey = s.readOnly ? `org:${s.id}` : s.id;
      if (next.some(t => t.id === tabKey)) continue;
      next.push({
        id: tabKey,
        name: s.readOnly ? `${s.name} (Read-only)` : s.name,
        data: s.data || {},
        version: s.version ?? null,
        isDirty: false,
        isLoading: !hasPayload(s.data),
        readOnly: !!s.readOnly,
        workbookId: s.workbookId ?? null,
        workbookName: s.workbookName ?? null,
      });
    }
    if (!next.length && emptyWorkbook) {
      next.push({
        id: null,
        name: "New Sheet 1",
        data: {},
        isDirty: false,
        isLoading: false,
        workbookId: emptyWorkbook.id,
        workbookName: emptyWorkbook.name,
      });
    }
    setTabs(next);
    setActiveTabIndex(0);

    setCurrentView("editor");

    // Fetch any sheets that arrived without an embedded payload
    incoming.filter(s => !hasPayload(s.data)).forEach(async (s) => {
      const tabKey = s.readOnly ? `org:${s.id}` : s.id;
      try {
        const detail = await getSheet(s.id);
        setTabs(prev => prev.map(t => t.id === tabKey ? { ...t, data: detail?.data || {}, version: detail?.version ?? null, isLoading: false } : t));
      } catch {
        setTabs(prev => prev.map(t => t.id === tabKey ? { ...t, isLoading: false } : t));
      }
    });
  }, []);


  const closeTab = useCallback((index: number): boolean => {
    const tab = tabs[index];
    if (tab) logger.info("Sheet closed", { component: "SheetContext", sheet_id: tab.id, sheet_name: tab.name });
    if (tab?.isDirty) {
      const confirmed = window.confirm(`"${tab.name}" has unsaved changes. Close anyway?`);
      if (!confirmed) return false;
    }
    setTabs(prev => {
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
    // Adjust active index
    setActiveTabIndex(prev => {
      if (tabs.length <= 1) return 0;
      if (prev >= index && prev > 0) return prev - 1;
      return prev;
    });
    // Go to dashboard if no tabs left
    if (tabs.length <= 1) {
      setCurrentView("dashboard");
    }
    return true;
  }, [tabs]);

  const deleteCurrentSheet = useCallback(async () => {
    const tab = tabs[activeTabIndex];
    if (!tab) return;
    const confirmed = window.confirm(`Delete "${tab.name}"? This cannot be undone.`);
    if (!confirmed) return;

    if (tab.id && !tab.id.startsWith("org:") && !tab.readOnly) {
      const ok = await deleteSheet(tab.id);
      if (!ok) {
        toast.error("Failed to delete sheet");
        return;
      }
    }

    logger.info("Sheet deleted", { component: "SheetContext", sheet_id: tab.id, sheet_name: tab.name });
    toast.success("Sheet deleted");
    closeTab(activeTabIndex);
  }, [tabs, activeTabIndex, closeTab]);

  const saveCurrentSheet = useCallback(async (name: string, data: Record<string, unknown>, workbookId?: string | null) => {
    const tab = tabs[activeTabIndex];
    if (!tab) return;
    if (tab.readOnly) {
      toast.error("This sheet is read-only. Use 'Copy Sheet' to make an editable copy.");
      return;
    }

    const wbId = workbookId !== undefined ? workbookId : (tab.workbookId ?? null);

    try {
      let result: SheetDetail | null;
      if (tab.id && !tab.id.startsWith("org:")) {
        // Update existing, versioned (D-059): refused if saved elsewhere since it was loaded
        result = await updateSheet(tab.id, name, data, wbId, tab.version ?? null);
      } else {
        // Create new
        result = await saveSheet(name, data, wbId);
      }

      if (result) {
        setTabs(prev => prev.map((t, i) => i === activeTabIndex ? {
          ...t,
          id: result!.id,
          name: result!.name,
          data: result!.data || data,
          workbookId: wbId,
          version: result!.version ?? null,
          isDirty: false,
        } : t));
        logger.info(tab.id ? "Sheet updated" : "Sheet saved", { component: "SheetContext", sheet_id: result.id, sheet_name: result.name });
        toast.success(tab.id ? "Sheet updated" : "Sheet saved");
      } else {
        logger.error("Sheet save returned no result", { component: "SheetContext", sheet_id: tab.id });
        toast.error("Failed to save sheet");
      }
    } catch (err) {
      if (err instanceof SheetSaveConflict) {
        // Never overwrite silently (D-059): the edits stay; the user decides.
        reportSaveConflict(err, tab.name, async () => {
          const forced = await updateSheet(tab.id!, name, data, wbId, err.currentVersion);
          if (forced) {
            setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, data: forced.data || data, version: forced.version ?? null, isDirty: false } : t));
            toast.success("Sheet saved over the newer version");
          }
        });
        return;
      }
      logger.error("Sheet save failed", { component: "SheetContext", sheet_id: tab.id, stack: (err as Error)?.stack });
      toast.error("Error saving sheet");
    }
  }, [tabs, activeTabIndex]);

  // Current-data getter registered by the editor, used for auto-save on leave
  const dataGetterRef = useRef<(() => Record<string, unknown>) | null>(null);
  const registerDataGetter = useCallback((fn: (() => Record<string, unknown>) | null) => {
    dataGetterRef.current = fn;
  }, []);

  const autoSaveTab = useCallback(async (index: number) => {
    const tab = tabs[index];
    const getter = dataGetterRef.current;
    if (!tab || tab.readOnly || !tab.isDirty || !getter) return;
    // A server session saves its sheet on close itself (M7/M10); a REST save
    // here would race it (LEASE_HELD).
    if (tab.serverSession) return;
    const data = getter();
    const wbId = tab.workbookId ?? null;
    // Keep the in-memory copy so re-opening the tab shows the latest values
    setTabs(prev => prev.map((t, i) => i === index ? { ...t, data } : t));
    try {
      const result = tab.id && !tab.id.startsWith("org:")
        ? await updateSheet(tab.id, tab.name, data, wbId, tab.version ?? null)
        : await saveSheet(tab.name, data, wbId);
      if (result) {
        setTabs(prev => prev.map((t, i) => i === index ? { ...t, id: result.id, name: result.name, data: result.data || data, version: result.version ?? null, isDirty: false } : t));
        toast.success(`"${result.name}" auto-saved`);
      } else {
        toast.error(`Auto-save failed for "${tab.name}"`);
      }
    } catch (err) {
      if (err instanceof SheetSaveConflict) {
        // Not auto-saved over a newer version; the tab stays dirty (D-059).
        toast.error(`"${tab.name}" was not auto-saved: it was changed elsewhere. Open it to decide.`);
        return;
      }
      toast.error(`Auto-save failed for "${tab.name}"`);
    }
  }, [tabs]);

  const markDirty = useCallback(() => {
    setTabs(prev => prev.map((t, i) => (i === activeTabIndex && !t.readOnly && !t.isDirty) ? { ...t, isDirty: true } : t));
  }, [activeTabIndex]);

  const markClean = useCallback(() => {
    setTabs(prev => prev.map((t, i) => (i === activeTabIndex && t.isDirty) ? { ...t, isDirty: false } : t));
  }, [activeTabIndex]);

  // Auto-save the current sheet before leaving it (no popup)
  const confirmLeave = useCallback((): boolean => {
    if (currentView === "editor" && activeTab?.isDirty && !activeTab.readOnly) {
      void autoSaveTab(activeTabIndex);
    }
    return true;
  }, [currentView, activeTab, activeTabIndex, autoSaveTab]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (currentView === "editor" && activeTab?.isDirty && !activeTab.readOnly) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [currentView, activeTab]);

  const goToDashboard = useCallback(() => {
    if (!confirmLeave()) return;
    trackView("dashboard", { component: "SheetContext" });
    // Return to the Workbooks section when the active sheet belongs to a workbook,
    // otherwise fall back to the Overview section.
    const section: DashSection = activeTab?.workbookId ? "workbooks" : "overview";
    setReturnSection(section);
    setCurrentView("dashboard");
  }, [activeTab?.workbookId, confirmLeave]);

  const guardedSetActiveTabIndex = useCallback((index: number) => {
    if (index === activeTabIndex) return;
    if (!confirmLeave()) return;
    setActiveTabIndex(index);
  }, [activeTabIndex, confirmLeave]);

  const guardedSetCurrentView = useCallback((view: "dashboard" | "editor" | "admin" | "compare") => {
    if (view !== currentView && view !== "editor" && !confirmLeave()) return;
    setCurrentView(view);
  }, [currentView, confirmLeave]);

  const guardedCreateNewSheet = useCallback((workbookId?: string | null, workbookName?: string | null) => {
    if (!confirmLeave()) return;
    createNewSheet(workbookId, workbookName);
  }, [confirmLeave, createNewSheet]);

  const renameTab = useCallback((index: number, name: string) => {
    trackEvent("sheet.rename", { component: "SheetContext", sheet_index: index, sheet_name: name });
    setTabs(prev => prev.map((t, i) => i === index ? { ...t, name, isDirty: true } : t));
  }, []);

  const setTabServerState = useCallback((id: string, state: { version?: number | null; serverSession?: boolean }) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...state } : t));
  }, []);

  const updateTabData = useCallback((index: number, data: Record<string, unknown>) => {
    setTabs(prev => prev.map((t, i) => i === index ? { ...t, data } : t));
  }, []);

  return (
    <SheetContext.Provider value={{
      currentView, setCurrentView: guardedSetCurrentView,
      returnSection, setReturnSection,
      tabs, activeTabIndex, setActiveTabIndex: guardedSetActiveTabIndex, activeTab,
      createNewSheet: guardedCreateNewSheet, copyCurrentSheet, copySheets, openSheet, openOrganizationSheet, openSheets, closeTab, saveCurrentSheet, deleteCurrentSheet, markDirty, markClean, goToDashboard, registerDataGetter, renameTab, updateTabData, setTabServerState,
      compareSheetIds, openCompare,
    }}>
      {children}
    </SheetContext.Provider>
  );
}

