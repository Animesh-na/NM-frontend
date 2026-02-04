import { useVoyageContext } from "@/context/VoyageContext";
import { Link } from "react-router-dom";
import { ArrowLeft, Calculator, Ship, Anchor, Package, Fuel, Clock, DollarSign, Leaf, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VesselCalculationPanel } from "@/components/breakdown/VesselCalculationPanel";
import { SequenceCalculationPanel } from "@/components/breakdown/SequenceCalculationPanel";
import { CargoCalculationPanel } from "@/components/breakdown/CargoCalculationPanel";
import { BunkerCalculationPanel } from "@/components/breakdown/BunkerCalculationPanel";
import { PortTimeCalculationPanel } from "@/components/breakdown/PortTimeCalculationPanel";
import { MiscCalculationPanel } from "@/components/breakdown/MiscCalculationPanel";
import { EmissionCalculationPanel } from "@/components/breakdown/EmissionCalculationPanel";
import { FinancialSummaryPanel } from "@/components/breakdown/FinancialSummaryPanel";
import { VoyageProvider } from "@/context/VoyageContext";

function CalculationBreakdownContent() {
  const { vessel, sequence, results, cargos, bunker, misc, hireRate } = useVoyageContext();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Voyage
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Calculation Breakdown</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Vessel: {vessel.name || "Not Selected"}</span>
            <span className="text-muted-foreground/50">|</span>
            <span>Legs: {sequence.length}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 space-y-4 max-w-7xl mx-auto">
        {/* Quick Summary Bar */}
        <div className="grid grid-cols-5 gap-4">
          <SummaryCard 
            icon={<Clock className="h-4 w-4" />}
            label="Total Days"
            value={`${results.totalVoyageDays.toFixed(2)} d`}
          />
          <SummaryCard 
            icon={<Fuel className="h-4 w-4" />}
            label="Bunker Cost"
            value={`$${results.totalBunkerCost.toLocaleString()}`}
          />
          <SummaryCard 
            icon={<DollarSign className="h-4 w-4" />}
            label="TCE"
            value={`$${results.tce.toFixed(0)}/d`}
          />
          <SummaryCard 
            icon={<DollarSign className="h-4 w-4" />}
            label="P&L"
            value={`$${results.pAndL.toLocaleString()}`}
            variant={results.pAndL >= 0 ? "success" : "destructive"}
          />
          <SummaryCard 
            icon={<Leaf className="h-4 w-4" />}
            label="CII Rating"
            value={results.ciiRating}
            variant={results.ciiRating === "A" || results.ciiRating === "B" ? "success" : results.ciiRating === "C" ? "warning" : "destructive"}
          />
        </div>

        {/* Calculation Panels */}
        <div className="space-y-4">
          <VesselCalculationPanel vessel={vessel} />
          <SequenceCalculationPanel sequence={sequence} vessel={vessel} />
          <CargoCalculationPanel cargos={cargos} results={results} />
          <BunkerCalculationPanel bunker={bunker} results={results} vessel={vessel} sequence={sequence} />
          <PortTimeCalculationPanel sequence={sequence} misc={misc} results={results} />
          <MiscCalculationPanel misc={misc} results={results} />
          <EmissionCalculationPanel results={results} bunker={bunker} vessel={vessel} />
          <FinancialSummaryPanel results={results} hireRate={hireRate} cargos={cargos} />
        </div>
      </main>
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  variant?: "default" | "success" | "destructive" | "warning";
}

function SummaryCard({ icon, label, value, variant = "default" }: SummaryCardProps) {
  const variantClasses = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-warning",
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`font-mono font-semibold text-lg ${variantClasses[variant]}`}>
        {value}
      </div>
    </div>
  );
}

// Wrapper component that provides context
export default function CalculationBreakdown() {
  return (
    <VoyageProvider>
      <CalculationBreakdownContent />
    </VoyageProvider>
  );
}
