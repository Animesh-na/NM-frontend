import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreakdownCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}

export function BreakdownCard({ title, icon, children, defaultOpen = true, badge }: BreakdownCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-primary">{icon}</div>
          <h2 className="font-semibold">{title}</h2>
          {badge && (
            <span className="px-2 py-0.5 text-xs bg-muted rounded-full text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-border p-4">
          {children}
        </div>
      )}
    </div>
  );
}

interface FormulaBlockProps {
  name: string;
  formula: string;
  inputs?: { label: string; value: string | number; source?: string }[];
  result?: { label: string; value: string | number };
  className?: string;
}

export function FormulaBlock({ name, formula, inputs, result, className }: FormulaBlockProps) {
  return (
    <div className={cn("bg-muted/50 rounded-lg p-3 space-y-2", className)}>
      <div className="font-medium text-sm">{name}</div>
      <div className="font-mono text-xs bg-background px-3 py-2 rounded border border-border">
        {formula}
      </div>
      {inputs && inputs.length > 0 && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {inputs.map((input, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-muted-foreground">
                {input.label}
                {input.source && (
                  <span className="ml-1 text-[10px] px-1 py-0.5 bg-primary/10 text-primary rounded">
                    {input.source}
                  </span>
                )}
              </span>
              <span className="font-mono">{input.value}</span>
            </div>
          ))}
        </div>
      )}
      {result && (
        <div className="flex justify-between items-center pt-2 border-t border-border text-sm">
          <span className="font-medium">{result.label}</span>
          <span className="font-mono font-semibold text-primary">{result.value}</span>
        </div>
      )}
    </div>
  );
}

interface ValueRowProps {
  label: string;
  value: string | number;
  source?: string;
  isTotal?: boolean;
}

export function ValueRow({ label, value, source, isTotal }: ValueRowProps) {
  return (
    <div className={cn(
      "flex justify-between items-center py-1 text-xs",
      isTotal && "border-t border-border pt-2 font-semibold"
    )}>
      <span className={cn("text-muted-foreground", isTotal && "text-foreground")}>
        {label}
        {source && (
          <span className="ml-1 text-[10px] px-1 py-0.5 bg-primary/10 text-primary rounded">
            {source}
          </span>
        )}
      </span>
      <span className={cn("font-mono", isTotal && "text-primary")}>{value}</span>
    </div>
  );
}
