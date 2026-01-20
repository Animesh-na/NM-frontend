import { ChevronDown, Settings, Clock } from "lucide-react";
import { useState } from "react";

export function MiscSection() {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="calc-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span>Miscellaneous</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-3">
          <div className="grid grid-cols-2 gap-4">
            {/* Misc Costs */}
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-muted-foreground block mb-1">
                    Misc cost
                  </label>
                  <div className="input-with-unit">
                    <span className="unit border-r-0 rounded-r-none rounded-l-sm">$</span>
                    <input
                      type="text"
                      className="form-input-sm w-full font-mono text-right rounded-l-none"
                      defaultValue={12000}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">
                    Extra Fees
                  </label>
                  <div className="input-with-unit">
                    <span className="unit border-r-0 rounded-r-none rounded-l-sm">$</span>
                    <input
                      type="text"
                      className="form-input-sm w-full font-mono text-right rounded-l-none"
                      defaultValue={0}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">
                    Canal cost 1
                  </label>
                  <div className="input-with-unit">
                    <span className="unit border-r-0 rounded-r-none rounded-l-sm">$</span>
                    <input
                      type="text"
                      className="form-input-sm w-full font-mono text-right rounded-l-none"
                      defaultValue={0}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-muted-foreground block mb-1">
                    Extra insurance
                  </label>
                  <div className="input-with-unit">
                    <span className="unit border-r-0 rounded-r-none rounded-l-sm">$</span>
                    <input
                      type="text"
                      className="form-input-sm w-full font-mono text-right rounded-l-none"
                      defaultValue={0}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">
                    Trade type
                  </label>
                  <select className="form-select text-xs h-6 w-full">
                    <option>---</option>
                    <option>Voyage</option>
                    <option>Time Charter</option>
                  </select>
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">
                    Canal cost 2
                  </label>
                  <div className="input-with-unit">
                    <span className="unit border-r-0 rounded-r-none rounded-l-sm">$</span>
                    <input
                      type="text"
                      className="form-input-sm w-full font-mono text-right rounded-l-none"
                      defaultValue={0}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Extra Time */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Extra time</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-muted-foreground block mb-1">
                    Time at Canal 1
                  </label>
                  <div className="flex items-center gap-1">
                    <select className="form-select text-xs h-6 w-12">
                      <option>VL</option>
                      <option>HS</option>
                    </select>
                    <input
                      type="text"
                      className="form-input-sm w-12 font-mono text-right"
                      defaultValue={0}
                    />
                    <select className="form-select text-xs h-6 w-16">
                      <option>days</option>
                      <option>hrs</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">
                    In port (idle)
                  </label>
                  <div className="flex items-center gap-1">
                    <select className="form-select text-xs h-6 w-12">
                      <option>VL</option>
                      <option>HS</option>
                    </select>
                    <input
                      type="text"
                      className="form-input-sm w-12 font-mono text-right"
                      defaultValue={0}
                    />
                    <select className="form-select text-xs h-6 w-16">
                      <option>hrs</option>
                      <option>days</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-muted-foreground block mb-1">
                    Time at Canal 2
                  </label>
                  <div className="flex items-center gap-1">
                    <select className="form-select text-xs h-6 w-12">
                      <option>VL</option>
                      <option>HS</option>
                    </select>
                    <input
                      type="text"
                      className="form-input-sm w-12 font-mono text-right"
                      defaultValue={0}
                    />
                    <select className="form-select text-xs h-6 w-16">
                      <option>hrs</option>
                      <option>days</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">
                    At sea (sailing)
                  </label>
                  <div className="flex items-center gap-1">
                    <select className="form-select text-xs h-6 w-12">
                      <option>EV</option>
                      <option>FH</option>
                    </select>
                    <input
                      type="text"
                      className="form-input-sm w-12 font-mono text-right"
                      defaultValue={0}
                    />
                    <select className="form-select text-xs h-6 w-16">
                      <option>hrs</option>
                      <option>days</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
