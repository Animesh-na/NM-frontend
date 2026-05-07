import { createContext, useContext } from "react";

export interface SheetTab {
  id: string | null; // null = unsaved new sheet
  name: string;
  data: Record<string, unknown>;
  isDirty: boolean;
  isLoading: boolean;
}

export interface SheetContextValue {
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

export const SheetContext = createContext<SheetContextValue | null>(null);

export function useSheets() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("useSheets must be used within SheetProvider");
  return ctx;
}