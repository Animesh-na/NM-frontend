import { FileText, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";

export function SheetNotes() {
  const [isExpanded, setIsExpanded] = useState(true);
  const { notes, setNotes } = useVoyageContext();

  return (
    <div className="calc-card-row">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-vertical"
        title="Notes"
      >
        <span>Notes</span>
      </button>

      {isExpanded && (
        <div className="flex-1 min-w-0 p-1.5">
          <textarea
            className="w-full h-12 form-input text-[11px] resize-none"
            placeholder="Add notes for this voyage calculation..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
