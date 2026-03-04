import { Ship, Calculator, FileText, Settings, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function CompactHeader() {
  const { logout } = useAuth();

  return (
    <header className="bg-primary text-primary-foreground h-8 flex items-center justify-between px-3 text-xs">
      {/* Logo & Title */}
      <div className="flex items-center gap-2">
        <Ship className="h-4 w-4" />
        <span className="font-semibold">VoyageCalc</span>
        <span className="text-primary-foreground/70">|</span>
        <span className="text-section-header-foreground/70">Voyage Estimator</span>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-1 hover:text-white/80 transition-colors">
          <Calculator className="h-3 w-3" />
          <span>New Calc</span>
        </button>
        <button className="flex items-center gap-1 hover:text-white/80 transition-colors">
          <span>Save</span>
        </button>
        <Link 
          to="/calculation-breakdown"
          className="flex items-center gap-1 hover:text-white/80 transition-colors"
        >
          <FileText className="h-3 w-3" />
          <span>Details</span>
        </Link>
        <button className="flex items-center gap-1 hover:text-white/80 transition-colors">
          <Settings className="h-3 w-3" />
        </button>
        <span className="text-section-header-foreground/30">|</span>
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
