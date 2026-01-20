import { FileText, ChevronDown } from "lucide-react";
import { useState } from "react";

export function SheetNotes() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [notes, setNotes] = useState("");

  return (
    <div className="calc-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          <span>Sheet Notes</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-3">
          <textarea
            className="w-full h-20 form-input text-sm resize-none"
            placeholder="Add notes for this voyage calculation..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
