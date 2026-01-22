import { AppHeader } from "@/components/voyage/AppHeader";
import { VesselPanel } from "@/components/voyage/VesselPanel";
import { SequenceTable } from "@/components/voyage/SequenceTable";
import { CargoSection } from "@/components/voyage/CargoSection";
import { BunkerSection } from "@/components/voyage/BunkerSection";
import { MiscSection } from "@/components/voyage/MiscSection";
import { SheetNotes } from "@/components/voyage/SheetNotes";
import { VoyageSummary } from "@/components/voyage/VoyageSummary";
import { VoyageProvider } from "@/context/VoyageContext";

const Index = () => {
  return (
    <VoyageProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader />
        
        <div className="flex-1 p-4">
          <div className="grid grid-cols-12 gap-4 h-full">
            {/* Main Content - Left Side */}
            <div className="col-span-9 space-y-4">
              {/* Vessel Panel */}
              <VesselPanel />
              
              {/* Sequence Table */}
              <SequenceTable />
              
              {/* Cargo Section */}
              <CargoSection />
              
              {/* Bunker Section */}
              <BunkerSection />
              
              {/* Miscellaneous Section */}
              <MiscSection />
              
              {/* Sheet Notes */}
              <SheetNotes />
            </div>
            
            {/* Summary Panel - Right Side */}
            <div className="col-span-3">
              <div className="sticky top-4">
                <VoyageSummary />
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <footer className="bg-card border-t border-border px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>© 2026 VoyageCalc</span>
            <span>•</span>
            <span>Maritime Voyage Calculator</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="btn-primary">Apply</button>
            <button className="btn-success">Calculate</button>
            <button className="btn-secondary">Back</button>
            <button className="btn-danger">Close</button>
          </div>
        </footer>
      </div>
    </VoyageProvider>
  );
};

export default Index;
