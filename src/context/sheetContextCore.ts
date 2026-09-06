import { createContext, useContext } from "react";

export interface SheetTab {
  id: string | null; // null = unsaved new sheet
  name: string;
  data: Record<string, unknown>;
  isDirty: boolean;
  isLoading: boolean;
  readOnly?: boolean; // true for organization sheets owned by other users
  workbookId?: string | null; // workbook this sheet belongs to
}

export interface SheetContextValue {
  // Navigation
  currentView: "dashboard" | "editor" | "admin" | "compare";
  setCurrentView: (view: "dashboard" | "editor" | "admin" | "compare") => void;

  // Compare Sheets
  compareSheetIds: string[];
  openCompare: (ids: string[]) => void;

  // Tabs
  tabs: SheetTab[];
  activeTabIndex: number;
  setActiveTabIndex: (index: number) => void;
  activeTab: SheetTab | null;

  // Actions
  createNewSheet: () => void;
  copyCurrentSheet: () => void;
  openSheet: (id: string, name: string) => void;
  openOrganizationSheet: (id: string, name: string) => void;
  /** Open several already-loaded sheets (e.g. a whole workbook) as tabs at once. */
  openSheets: (sheets: { id: string; name: string; data?: Record<string, unknown>; readOnly?: boolean; workbookId?: string | null }[]) => void;

  closeTab: (index: number) => boolean; // returns false if user cancels
  saveCurrentSheet: (name: string, data: Record<string, unknown>, workbookId?: string | null) => Promise<void>;
  deleteCurrentSheet: () => Promise<void>;
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