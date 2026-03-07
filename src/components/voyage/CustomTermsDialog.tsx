import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CustomTermsDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, coefficient: number) => void;
  initialName?: string;
  initialCoefficient?: number;
}

export function CustomTermsDialog({ open, onClose, onSave, initialName = "", initialCoefficient = 1.0 }: CustomTermsDialogProps) {
  const [name, setName] = useState(initialName);
  const [coefficient, setCoefficient] = useState(initialCoefficient);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), coefficient);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Custom Terms</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Terms Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. myterms"
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Coefficient Factor</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={coefficient || ""}
              onChange={(e) => setCoefficient(parseFloat(e.target.value) || 0)}
              placeholder="1.0"
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-7">Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim()} className="text-xs h-7">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
