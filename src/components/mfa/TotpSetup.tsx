import { useState, useEffect, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Copy, Check } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { totpSetup, totpConfirm, MfaApiError } from "@/services/mfaApi";

interface TotpSetupProps {
  onSuccess: () => void;
}

const TotpSetup = ({ onSuccess }: TotpSetupProps) => {
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [setupError, setSetupError] = useState("");
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [copied, setCopied] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  const startSetup = useCallback(async () => {
    setLoadingSetup(true);
    setSetupError("");
    try {
      const { secret, otpauth_url } = await totpSetup();
      setSecret(secret);
      setOtpauthUrl(otpauth_url);
    } catch (err) {
      const msg = err instanceof MfaApiError && err.status === 409
        ? "MFA is already enabled. Disable it first to switch methods."
        : "Could not start authenticator setup. Please try again.";
      setSetupError(msg);
    } finally {
      setLoadingSetup(false);
    }
  }, []);

  useEffect(() => {
    startSetup();
  }, [startSetup]);

  const confirm = useCallback(async (value: string) => {
    setConfirming(true);
    setConfirmError("");
    try {
      await totpConfirm(value);
      onSuccess();
    } catch (err) {
      const msg = err instanceof MfaApiError && err.status === 401
        ? "That code didn't match — try the latest one."
        : "Could not verify the code. Please try again.";
      setConfirmError(msg);
      setCode("");
      // Re-focus the input so the user can immediately retype the latest code.
      setTimeout(() => otpRef.current?.focus(), 0);
    } finally {
      setConfirming(false);
    }
  }, [onSuccess]);

  const copySecret = () => {
    navigator.clipboard?.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (loadingSetup) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Preparing setup...
      </div>
    );
  }

  if (setupError) {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-destructive">{setupError}</p>
        <button onClick={startSetup} className="btn-secondary h-8 px-3 text-xs">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Scan this QR code with Google Authenticator, Microsoft Authenticator, or any
        TOTP app. Then enter the 6-digit code it shows.
      </p>

      <div className="flex justify-center">
        <div className="bg-white p-3 rounded-md border border-border">
          <QRCodeSVG value={otpauthUrl} size={168} />
        </div>
      </div>

      <div>
        <label className="text-[11px] text-muted-foreground block mb-1">
          Or enter this key manually
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded break-all font-mono">
            {secret}
          </code>
          <button
            type="button"
            onClick={copySecret}
            className="btn-secondary h-7 w-7 flex items-center justify-center shrink-0"
            title="Copy key"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="pt-1">
        <label className="text-xs font-medium text-foreground block mb-2 text-center">
          Enter the 6-digit code from your app
        </label>
        <InputOTP
          ref={otpRef}
          maxLength={6}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (v.length === 6) confirm(v);
          }}
          disabled={confirming}
          autoFocus
          containerClassName="justify-center"
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {confirmError && <p className="text-xs text-destructive font-medium mt-2">{confirmError}</p>}
      </div>

      <button
        type="button"
        onClick={() => code.length === 6 && confirm(code)}
        disabled={confirming || code.length !== 6}
        className="w-full h-9 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
        {confirming ? "Verifying..." : "Enable authenticator"}
      </button>
    </div>
  );
};

export default TotpSetup;
