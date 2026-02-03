import { 
  Ship, 
  List, 
  BookOpen, 
  Calculator,
  Anchor,
  Fuel,
  Truck,
  Settings,
  FileText
} from "lucide-react";
import { Link } from "react-router-dom";

const navItems = [
  { icon: Settings, label: "Apps", active: false },
  { icon: List, label: "Updaters", active: false },
  { icon: BookOpen, label: "Insights", active: false },
  { icon: Calculator, label: "Estimator", active: true },
  { icon: Ship, label: "ShipList", active: false },
  { icon: BookOpen, label: "Cargobook", active: false },
  { icon: Anchor, label: "FixDry", active: false },
  { icon: Calculator, label: "Distances", active: false },
  { icon: Fuel, label: "Bunkers", active: false },
  { icon: Truck, label: "Congestion", active: false },
];

export function AppHeader() {
  return (
    <header className="bg-card border-b border-border">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
            <Ship className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">VoyageCalc</span>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`flex flex-col items-center px-3 py-1.5 rounded-sm text-xs transition-colors ${
                item.active
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 mb-0.5" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Search */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search for Ship, Port, Owner, ..."
            className="form-input w-64 text-sm"
          />
          <button className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
            DN
          </button>
        </div>
      </div>

      {/* Secondary toolbar */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-muted border-t border-border text-xs">
        <span className="font-medium">Workbook</span>
        <button className="px-2 py-1 bg-card border border-border rounded-sm hover:bg-secondary">
          New calcul
        </button>
        <span className="text-muted-foreground mx-2">|</span>
        <button className="text-muted-foreground hover:text-foreground">New</button>
        <button className="text-muted-foreground hover:text-foreground">Open</button>
        <button className="text-muted-foreground hover:text-foreground">Save as new Workbook</button>
        <button className="text-muted-foreground hover:text-foreground">Search</button>
        <button className="text-muted-foreground hover:text-foreground">Duplicate</button>
        <button className="text-muted-foreground hover:text-foreground">Quick Compare</button>
        <button className="text-muted-foreground hover:text-foreground">Sensitivity</button>
        <button className="text-muted-foreground hover:text-foreground">Sheet Export</button>
        <button className="text-muted-foreground hover:text-foreground">Compare & Export</button>
        <button className="text-muted-foreground hover:text-foreground">Print</button>
        
        <Link 
          to="/calculation-breakdown"
          className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary border border-primary/30 rounded-sm hover:bg-primary/20 transition-colors font-medium"
        >
          <FileText className="h-3 w-3" />
          Calc Details
        </Link>
        
        <div className="ml-auto flex items-center gap-2">
          <span className="text-primary font-semibold">Voyage Calculator 5.0</span>
          <span className="text-muted-foreground">
            Session Status: {new Date().toLocaleString()}
          </span>
        </div>
      </div>
    </header>
  );
}
