import { CompactHeader } from "@/components/voyage/CompactHeader";
import { VesselPanel } from "@/components/voyage/VesselPanel";
import { SequenceTable } from "@/components/voyage/SequenceTable";
import { CargoSection } from "@/components/voyage/CargoSection";
import { BunkerSection } from "@/components/voyage/BunkerSection";
import { MiscSection } from "@/components/voyage/MiscSection";
import { SheetNotes } from "@/components/voyage/SheetNotes";
import { VoyageSummary } from "@/components/voyage/VoyageSummary";

const Index = () => {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Minimal Header */}
      <CompactHeader />
      
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Fully Scrollable */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
          <VesselPanel />
          <SequenceTable />
          <CargoSection />
          <BunkerSection />
          <MiscSection />
          <SheetNotes />
        </div>
        
        {/* Right Panel - Sticky Summary */}
        <div className="w-72 flex-shrink-0 border-l border-border overflow-y-auto bg-muted/30">
          <div className="p-2 h-full">
            <VoyageSummary />
          </div>
        </div>
      </div>
      
      {/* Compact Footer with Actions */}
      <footer className="bg-card border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span>© 2026 VoyageCalc</span>
          <span className="text-muted-foreground/50">|</span>
          <span>Session: {new Date().toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary">Apply</button>
          <button className="btn-success">Calculate</button>
          <button className="btn-secondary">Back</button>
          <button className="btn-danger">Close</button>
        </div>
      </footer>
    </div>
  );
};

export default Index;
