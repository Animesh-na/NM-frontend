import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";

const SKIP_KEY = "mfaSkipUntil";          // temporary: re-nag after the window
const DISMISS_KEY = "mfaPromptDismissed"; // permanent (this device): never nag
const SKIP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

interface MfaSetupGateProps {
  // Open the full MFA management dialog when the user chooses to set up.
  onSetup: () => void;
}

// Post-login nag: prompts users without MFA to enable it. Whether/when to re-show
// is purely frontend state — "Remind me later" sets a 24h window, "Don't show
// again" sets a permanent (per-device) flag in localStorage. No backend involved.
const MfaSetupGate = ({ onSetup }: MfaSetupGateProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.mfa_method) return;                              // already protected
    if (localStorage.getItem(DISMISS_KEY) === "true") return; // permanently dismissed
    const skippedUntil = localStorage.getItem(SKIP_KEY);
    if (skippedUntil && Date.now() < Number(skippedUntil)) return;
    setOpen(true);
  }, [user]);

  const handleRemindLater = () => {
    localStorage.setItem(SKIP_KEY, String(Date.now() + SKIP_WINDOW_MS));
    setOpen(false);
  };

  const handleDontShowAgain = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setOpen(false);
  };

  const handleSetup = () => {
    setOpen(false);
    onSetup();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Secure your account</DialogTitle>
          <DialogDescription className="text-center">
            Add two-factor authentication for an extra layer of protection at login.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={handleSetup}
            className="w-full h-9 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:bg-primary/90 transition-colors"
          >
            Set up now
          </button>
          <button
            type="button"
            onClick={handleRemindLater}
            className="w-full h-9 text-sm font-medium rounded-sm border border-border text-foreground hover:bg-muted transition-colors"
          >
            Remind me later
          </button>
          <button
            type="button"
            onClick={handleDontShowAgain}
            className="w-full h-8 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Don't show again
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MfaSetupGate;
