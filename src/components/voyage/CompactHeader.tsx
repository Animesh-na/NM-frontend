import { Ship, FileText, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { CompareSheetsLauncher } from "@/components/compare/CompareSheetsLauncher";

export function CompactHeader() {
  const { logout, user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <header className="bg-primary text-primary-foreground h-8 flex items-center justify-between px-3 text-xs">
      {/* Logo & Title */}
      <div className="flex items-center gap-2">
        <Ship className="h-4 w-4" />
        <span className="font-semibold">VoyageCalc</span>
        <span className="text-primary-foreground/70">|</span>
        <span className="text-primary-foreground/70">Voyage Estimator</span>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link 
            to="/calculation-breakdown"
            className="flex items-center gap-1 hover:text-white/80 transition-colors"
          >
            <FileText className="h-3 w-3" />
            <span>Details</span>
          </Link>
        )}
        <CompareSheetsLauncher variant="compact" />
        <button
          onClick={logout}
          className="flex items-center gap-1 hover:text-white/80 transition-colors"
        >
          <LogOut className="h-3 w-3" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}
