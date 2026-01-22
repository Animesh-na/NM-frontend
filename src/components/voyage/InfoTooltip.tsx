import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InfoTooltipProps {
  formula: string;
  description?: string;
}

export function InfoTooltip({ formula, description }: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors ml-1">
            <Info className="h-2.5 w-2.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <div className="text-xs space-y-1">
            <div className="font-mono text-[10px] bg-muted px-1.5 py-1 rounded">
              {formula}
            </div>
            {description && (
              <div className="text-muted-foreground text-[10px]">
                {description}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
