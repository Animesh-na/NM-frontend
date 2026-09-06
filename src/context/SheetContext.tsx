import { useState, useCallback, type ReactNode } from "react";
import { SheetContext, type SheetTab } from "@/context/sheetContextCore";
import { getSheet, saveSheet, updateSheet, deleteSheet, type SheetDetail } from "@/services/marineApi";
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
        workbookId: detail.workbook_id ?? null,
        workbookName: detail.workbook_name ?? null,
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
        setTabs(prev => prev.map(t => t.id === id ? { ...t, data: detail.data || {}, isLoading: false } : t));
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
        setTabs(prev => prev.map(t => t.id === tabKey ? { ...t, data: detail.data || {}, isLoading: false } : t));
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
    incoming: { id: string; name: string; data?: Record<string, unknown>; readOnly?: boolean; workbookId?: string | null; workbookName?: string | null }[],
    emptyWorkbook?: { id: string; name: string }
  ) => {
    if (!incoming.length && !emptyWorkbook) return;

    trackEvent("workbook.open", { component: "SheetContext", sheet_count: incoming.length });
    const next: SheetTab[] = [];
    for (const s of incoming) {
      const tabKey = s.readOnly ? `org:${s.id}` : s.id;
      if (next.some(t => t.id === tabKey)) continue;
      next.push({
        id: tabKey,
        name: s.readOnly ? `${s.name} (Read-only)` : s.name,
        data: s.data || {},
        isDirty: false,
        isLoading: !s.data,
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
    incoming.filter(s => !s.data).forEach(async (s) => {
      const tabKey = s.readOnly ? `org:${s.id}` : s.id;
      try {
        const detail = await getSheet(s.id);
        setTabs(prev => prev.map(t => t.id === tabKey ? { ...t, data: detail?.data || {}, isLoading: false } : t));
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
        // Update existing
        result = await updateSheet(tab.id, name, data, wbId);
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
          isDirty: false,
        } : t));
        logger.info(tab.id ? "Sheet updated" : "Sheet saved", { component: "SheetContext", sheet_id: result.id, sheet_name: result.name });
        toast.success(tab.id ? "Sheet updated" : "Sheet saved");
      } else {
        logger.error("Sheet save returned no result", { component: "SheetContext", sheet_id: tab.id });
        toast.error("Failed to save sheet");
      }
    } catch (err) {
      logger.error("Sheet save failed", { component: "SheetContext", sheet_id: tab.id, stack: (err as Error)?.stack });
      toast.error("Error saving sheet");
    }
  }, [tabs, activeTabIndex]);

  const markDirty = useCallback(() => {
    setTabs(prev => prev.map((t, i) => (i === activeTabIndex && !t.readOnly) ? { ...t, isDirty: true } : t));
  }, [activeTabIndex]);

  const goToDashboard = useCallback(() => {
    trackView("dashboard", { component: "SheetContext" });
    // Return to the Workbooks section when the active sheet belongs to a workbook,
    // otherwise fall back to the Overview section.
    const section: DashSection = activeTab?.workbookId ? "workbooks" : "overview";
    setReturnSection(section);
    setCurrentView("dashboard");
  }, [activeTab?.workbookId]);

  const renameTab = useCallback((index: number, name: string) => {
    trackEvent("sheet.rename", { component: "SheetContext", sheet_index: index, sheet_name: name });
    setTabs(prev => prev.map((t, i) => i === index ? { ...t, name, isDirty: true } : t));
  }, []);

  const updateTabData = useCallback((index: number, data: Record<string, unknown>) => {
    setTabs(prev => prev.map((t, i) => i === index ? { ...t, data } : t));
  }, []);

  return (
    <SheetContext.Provider value={{
      currentView, setCurrentView,
      returnSection, setReturnSection,
      tabs, activeTabIndex, setActiveTabIndex, activeTab,
      createNewSheet, copyCurrentSheet, openSheet, openOrganizationSheet, openSheets, closeTab, saveCurrentSheet, deleteCurrentSheet, markDirty, goToDashboard, renameTab, updateTabData,
      compareSheetIds, openCompare,
    }}>
      {children}
    </SheetContext.Provider>
  );
}

