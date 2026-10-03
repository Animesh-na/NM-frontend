import { createContext, useContext } from "react";
import type { DashSection } from "@/components/dashboard/DashboardSidebar";

export interface SheetTab {
  id: string | null; // null = unsaved new sheet
  name: string;
  data: Record<string, unknown>;
  isDirty: boolean;
  isLoading: boolean;
  readOnly?: boolean; // true for organization sheets owned by other users
  workbookId?: string | null; // workbook this sheet belongs to
  workbookName?: string | null;
  /** Version the editor's data is based on (sent as base_version on REST saves, D-059). */
  version?: number | null;
  /** A server calculation session owns this tab's saves (M7/M10): no REST auto-save on leave. */
  serverSession?: boolean;
}

export interface SheetContextValue {
  // Navigation
  currentView: "dashboard" | "editor" | "admin" | "compare";
  setCurrentView: (view: "dashboard" | "editor" | "admin" | "compare") => void;

  // Dashboard section to restore when returning from the editor
  returnSection: DashSection | null;
  setReturnSection: (section: DashSection | null) => void;

  // Compare Sheets
  compareSheetIds: string[];
  openCompare: (ids: string[]) => void;

  // Tabs
  tabs: SheetTab[];
  activeTabIndex: number;
  setActiveTabIndex: (index: number) => void;
  activeTab: SheetTab | null;

  // Actions
  createNewSheet: (workbookId?: string | null, workbookName?: string | null) => void;
  copyCurrentSheet: () => void;
  /** Copy sheets by id (any workbook, incl. read-only) into editable new tabs. */
  copySheets: (ids: string[]) => Promise<void>;
  openSheet: (id: string, name: string) => void;
  openOrganizationSheet: (id: string, name: string) => void;
  /** Replace all tabs with one workbook's sheets, or a blank linked sheet when empty. */
  openSheets: (
    sheets: { id: string; name: string; data?: Record<string, unknown>; readOnly?: boolean; workbookId?: string | null; workbookName?: string | null }[],
    emptyWorkbook?: { id: string; name: string }
  ) => void;

  closeTab: (index: number) => boolean; // returns false if user cancels
  saveCurrentSheet: (name: string, data: Record<string, unknown>, workbookId?: string | null) => Promise<void>;
  deleteCurrentSheet: () => Promise<void>;
  markDirty: () => void;
  markClean: () => void;
  registerDataGetter: (fn: (() => Record<string, unknown>) | null) => void;
  goToDashboard: () => void;
  renameTab: (index: number, name: string) => void;
  updateTabData: (index: number, data: Record<string, unknown>) => void;
  /** The server session saved `version` / owns or released the tab's saves (M10). */
  setTabServerState: (id: string, state: { version?: number | null; serverSession?: boolean }) => void;
}

export const SheetContext = createContext<SheetContextValue | null>(null);

export function useSheets() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("useSheets must be used within SheetProvider");
  return ctx;
}