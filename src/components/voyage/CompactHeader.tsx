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
    <header className="sheet-topbar h-10 flex items-center justify-between px-4 text-xs flex-shrink-0">
      {/* Logo & Title */}
      <div className="flex items-center gap-2.5">
        <span className="flex items-center justify-center h-6 w-6 rounded-lg bg-white/15 backdrop-blur">
          <Ship className="h-3.5 w-3.5" />
        </span>
        <div className="leading-tight">
          <div className="font-semibold text-[12px] tracking-tight">VoyageCalc</div>
          <div className="text-[9px] uppercase tracking-[0.14em] text-primary-foreground/60">Voyage Estimator</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-1.5">
        {activeTab?.workbookName && (
          <span
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-white/15 font-semibold max-w-[220px]"
            title={`Workbook: ${activeTab.workbookName}`}
          >
            <BookOpen className="h-3 w-3" />
            <span className="truncate">{activeTab.workbookName}</span>
          </span>
        )}
        {isAdmin && (
          <Link 
            to="/calculation-breakdown"
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors font-medium"
          >
            <FileText className="h-3 w-3" />
            <span>Details</span>
          </Link>
        )}
        <CopySheetsLauncher variant="compact" />
        <CompareSheetsLauncher variant="compact" />
        <button
          onClick={logout}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors font-medium"
        >
          <LogOut className="h-3 w-3" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}
