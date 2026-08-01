import { useState, useEffect } from "react";
import { ShieldCheck, Smartphone, Mail } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { useAuth, type MfaMethod } from "@/context/AuthContext";
import { trackEvent } from "@/services/logger";
import TotpSetup from "./TotpSetup";
import EmailOtpSetup from "./EmailOtpSetup";
import DisableMfa from "./DisableMfa";

interface MfaManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const METHOD_LABEL: Record<Exclude<MfaMethod, "">, string> = {
  totp: "Authenticator app",
  email_otp: "Email codes",
};

const MfaManageDialog = ({ open, onOpenChange }: MfaManageDialogProps) => {
  const { user, setUserMfaMethod } = useAuth();
  const method = user?.mfa_method || "";
  const enabled = method !== "";

  const [setupTab, setSetupTab] = useState<"totp" | "email_otp">("totp");
  const [disabling, setDisabling] = useState(false);

  // Reset transient view state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setSetupTab("totp");
      setDisabling(false);
    }
  }, [open]);

  const handleEnabled = (m: MfaMethod) => {
    trackEvent("mfa.enabled", { component: "MfaManageDialog", method: m });
    setUserMfaMethod(m);
    toast.success("Two-factor authentication enabled");
  };

  const handleDisabled = () => {
    trackEvent("mfa.disabled", { component: "MfaManageDialog", previous_method: method });
    setUserMfaMethod("");
    setDisabling(false);
    toast.success("Two-factor authentication disabled");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Two-factor authentication
          </DialogTitle>
          <DialogDescription>
            Add a second step at login to keep your account secure.
          </DialogDescription>
        </DialogHeader>

        {enabled ? (
          disabling ? (
            <DisableMfa onSuccess={handleDisabled} onCancel={() => setDisabling(false)} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
                <div className="w-9 h-9 rounded-lg bg-green-500/15 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">MFA is on</p>
                  <p className="text-xs text-muted-foreground">
                    Method: {METHOD_LABEL[method as Exclude<MfaMethod, "">]}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                To switch methods, disable MFA first, then set up the other method.
              </p>
              <button
                type="button"
                onClick={() => setDisabling(true)}
                className="w-full h-9 text-sm font-medium rounded-sm border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
              >
                Disable MFA
              </button>
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSetupTab("totp")}
                className={`flex items-center justify-center gap-1.5 h-9 text-xs font-medium rounded-md border transition-colors ${
                  setupTab === "totp"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                Authenticator app
              </button>
              <button
                type="button"
                onClick={() => setSetupTab("email_otp")}
                className={`flex items-center justify-center gap-1.5 h-9 text-xs font-medium rounded-md border transition-colors ${
                  setupTab === "email_otp"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <Mail className="h-3.5 w-3.5" />
                Email
              </button>
            </div>

            {setupTab === "totp" ? (
              <TotpSetup onSuccess={() => handleEnabled("totp")} />
            ) : (
              <EmailOtpSetup onSuccess={() => handleEnabled("email_otp")} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MfaManageDialog;
