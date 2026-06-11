import { FileText, ChevronDown } from "lucide-react";
import { useState } from "react";

export function SheetNotes() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [notes, setNotes] = useState("");

  return (
    <div className="calc-card-row">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-vertical"
        title="Notes"
      >
        <FileText className="h-3.5 w-3.5" />
        <span>Notes</span>
      </button>

      {isExpanded && (
        <div className="flex-1 min-w-0 p-2">
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
