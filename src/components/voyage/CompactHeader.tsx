import { Ship, FileText, LogOut, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { CompareSheetsLauncher } from "@/components/compare/CompareSheetsLauncher";
import { CopySheetsLauncher } from "@/components/compare/CopySheetsLauncher";
import { useSheets } from "@/context/sheetContextCore";

export function CompactHeader() {
  const { logout, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { activeTab } = useSheets();

  return (
    <header className="sheet-topbar min-h-10 flex items-center justify-between gap-2 px-2 sm:px-4 py-1 text-xs flex-shrink-0">
      {/* Logo & Title */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex items-center justify-center h-6 w-6 rounded-lg bg-white/15 backdrop-blur">
          <Ship className="h-3.5 w-3.5" />
        </span>
        <div className="hidden min-w-0 leading-tight xs:block">
          <div className="font-semibold text-[12px] tracking-tight">VoyageCalc</div>
          <div className="text-[9px] uppercase tracking-[0.14em] text-primary-foreground/60">Voyage Estimator</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex min-w-0 items-center justify-end gap-1 overflow-x-auto sheet-scroll">
        {activeTab?.workbookName && (
          <span
            className="hidden sm:flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-primary-foreground/15 font-semibold max-w-[180px]"
            title={`Workbook: ${activeTab.workbookName}`}
          >
            <BookOpen className="h-3 w-3" />
            <span className="truncate">{activeTab.workbookName}</span>
          </span>
        )}
        {isAdmin && (
          <Link 
            to="/calculation-breakdown"
            className="touch-icon sm:w-auto sm:px-2.5 flex items-center gap-1.5 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors font-medium"
            aria-label="Calculation details"
          >
            <FileText className="h-3 w-3" />
            <span className="hidden sm:inline">Details</span>
          </Link>
        )}
        <CopySheetsLauncher variant="compact" />
        <CompareSheetsLauncher variant="compact" />
        <button
          onClick={logout}
          className="touch-icon sm:w-auto sm:px-2.5 flex items-center gap-1.5 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors font-medium"
          aria-label="Log out"
        >
          <LogOut className="h-3 w-3" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
