import { useState, useCallback, type ReactNode } from "react";
import { SheetContext, type SheetTab } from "@/context/sheetContextCore";
import { getSheet, saveSheet, updateSheet, type SheetDetail } from "@/services/marineApi";
import { toast } from "@/components/ui/sonner";
import { logger, trackEvent, trackView } from "@/services/logger";

export function SheetProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<"dashboard" | "editor" | "admin" | "compare">("dashboard");
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [compareSheetIds, setCompareSheetIds] = useState<string[]>([]);

  const openCompare = useCallback((ids: string[]) => {
    trackEvent("compare.open", { component: "SheetContext", sheet_count: ids.length, sheet_ids: ids });
    setCompareSheetIds(ids);
    setCurrentView("compare");
  }, []);

  const activeTab = tabs.length > 0 ? tabs[activeTabIndex] || null : null;

  const createNewSheet = useCallback(() => {
    logger.info("Sheet created (blank)", { component: "SheetContext" });
    const newTab: SheetTab = {
      id: null,
      name: `New Sheet ${tabs.length + 1}`,
      data: {},
      isDirty: false,
      isLoading: false,
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
    };
    setTabs(prev => [...prev, copiedTab]);
    setActiveTabIndex(tabs.length);
    setCurrentView("editor");
  }, [tabs, activeTabIndex]);

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

  const openSheets = useCallback((incoming: { id: string; name: string; data?: Record<string, unknown>; readOnly?: boolean }[]) => {

    if (!incoming.length) return;
    trackEvent("workbook.open", { component: "SheetContext", sheet_count: incoming.length });
    setTabs(prev => {
      const next = [...prev];
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
        });
      }
      setActiveTabIndex(Math.max(0, next.length - incoming.length));
      return next;
    });
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

  const saveCurrentSheet = useCallback(async (name: string, data: Record<string, unknown>) => {
    const tab = tabs[activeTabIndex];
    if (!tab) return;
    if (tab.readOnly) {
      toast.error("This sheet is read-only. Use 'Copy Sheet' to make an editable copy.");
      return;
    }

    try {
      let result: SheetDetail | null;
      if (tab.id && !tab.id.startsWith("org:")) {
        // Update existing
        result = await updateSheet(tab.id, name, data);
      } else {
        // Create new
        result = await saveSheet(name, data);
      }

      if (result) {
        setTabs(prev => prev.map((t, i) => i === activeTabIndex ? {
          ...t,
          id: result!.id,
          name: result!.name,
          data: result!.data || data,
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
    setCurrentView("dashboard");
  }, []);

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
      tabs, activeTabIndex, setActiveTabIndex, activeTab,
      createNewSheet, copyCurrentSheet, openSheet, openOrganizationSheet, openSheets, closeTab, saveCurrentSheet, markDirty, goToDashboard, renameTab, updateTabData,
      compareSheetIds, openCompare,
    }}>
      {children}
    </SheetContext.Provider>
  );
}

