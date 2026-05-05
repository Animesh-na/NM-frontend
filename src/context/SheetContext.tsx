import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { getSheet, saveSheet, updateSheet, type SheetDetail } from "@/services/marineApi";
import { toast } from "@/components/ui/sonner";

export interface SheetTab {
  id: string | null; // null = unsaved new sheet
  name: string;
  data: Record<string, unknown>;
  isDirty: boolean;
  isLoading: boolean;
}

interface SheetContextValue {
  // Navigation
  currentView: "dashboard" | "editor" | "admin";
  setCurrentView: (view: "dashboard" | "editor" | "admin") => void;
  
  // Tabs
  tabs: SheetTab[];
  activeTabIndex: number;
  setActiveTabIndex: (index: number) => void;
  activeTab: SheetTab | null;
  
  // Actions
  createNewSheet: () => void;
  copyCurrentSheet: () => void;
  openSheet: (id: string, name: string) => void;
  closeTab: (index: number) => boolean; // returns false if user cancels
  saveCurrentSheet: (name: string, data: Record<string, unknown>) => Promise<void>;
  markDirty: () => void;
  goToDashboard: () => void;
  renameTab: (index: number, name: string) => void;
  updateTabData: (index: number, data: Record<string, unknown>) => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function SheetProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<"dashboard" | "editor" | "admin">("dashboard");
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const activeTab = tabs.length > 0 ? tabs[activeTabIndex] || null : null;

  const createNewSheet = useCallback(() => {
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
    const copiedTab: SheetTab = {
      id: null,
      name: `${current.name} (Copy)`,
      data: JSON.parse(JSON.stringify(current.data)),
      isDirty: true,
      isLoading: false,
    };
    setTabs(prev => [...prev, copiedTab]);
    setActiveTabIndex(tabs.length);
    setCurrentView("editor");
  }, [tabs, activeTabIndex]);

  const openSheet = useCallback(async (id: string, name: string) => {
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

  const closeTab = useCallback((index: number): boolean => {
    const tab = tabs[index];
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

    try {
      let result: SheetDetail | null;
      if (tab.id) {
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
        toast.success(tab.id ? "Sheet updated" : "Sheet saved");
      } else {
        toast.error("Failed to save sheet");
      }
    } catch {
      toast.error("Error saving sheet");
    }
  }, [tabs, activeTabIndex]);

  const markDirty = useCallback(() => {
    setTabs(prev => prev.map((t, i) => i === activeTabIndex ? { ...t, isDirty: true } : t));
  }, [activeTabIndex]);

  const goToDashboard = useCallback(() => {
    setCurrentView("dashboard");
  }, []);

  const renameTab = useCallback((index: number, name: string) => {
    setTabs(prev => prev.map((t, i) => i === index ? { ...t, name, isDirty: true } : t));
  }, []);

  const updateTabData = useCallback((index: number, data: Record<string, unknown>) => {
    setTabs(prev => prev.map((t, i) => i === index ? { ...t, data } : t));
  }, []);

  return (
    <SheetContext.Provider value={{
      currentView, setCurrentView,
      tabs, activeTabIndex, setActiveTabIndex, activeTab,
      createNewSheet, copyCurrentSheet, openSheet, closeTab, saveCurrentSheet, markDirty, goToDashboard, renameTab, updateTabData,
    }}>
      {children}
    </SheetContext.Provider>
  );
}

export function useSheets() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("useSheets must be used within SheetProvider");
  return ctx;
}
