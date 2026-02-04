import { FileText, ChevronDown } from "lucide-react";
import { useState } from "react";

export function SheetNotes() {
  const [isExpanded, setIsExpanded] = useState(false); // Start collapsed
  const [notes, setNotes] = useState("");

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          <span>Notes</span>
          {notes && <span className="text-[9px] font-normal text-section-header-foreground/70 ml-1">•</span>}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-2">
          <textarea
            className="w-full h-16 form-input text-[11px] resize-none"
            placeholder="Add notes for this voyage calculation..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
