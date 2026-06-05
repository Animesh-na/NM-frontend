import { useState, useCallback, useRef } from "react";
import { Loader2, Mail } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { emailSetup, emailConfirm, MfaApiError } from "@/services/mfaApi";

interface EmailOtpSetupProps {
  onSuccess: () => void;
}

const EmailOtpSetup = ({ onSuccess }: EmailOtpSetupProps) => {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const otpRef = useRef<HTMLInputElement>(null);

  const sendCode = useCallback(async () => {
    setSending(true);
    setSetupError("");
    try {
      await emailSetup();
      setSent(true);
    } catch (err) {
      let msg = "Could not send the code. Please try again.";
      if (err instanceof MfaApiError) {
        if (err.status === 503) msg = "Email delivery isn't configured. Try the authenticator app instead.";
        else if (err.status === 409) msg = "MFA is already enabled. Disable it first to switch methods.";
      }
      setSetupError(msg);
    } finally {
      setSending(false);
    }
  }, []);

  const confirm = useCallback(async (value: string) => {
    setConfirming(true);
    setConfirmError("");
    try {
      await emailConfirm(value);
      onSuccess();
    } catch (err) {
      const msg = err instanceof MfaApiError && (err.status === 401 || err.status === 429)
        ? "Invalid or expired code. Send a new one and try again."
        : "Could not verify the code. Please try again.";
      setConfirmError(msg);
      setCode("");
      setTimeout(() => otpRef.current?.focus(), 0);
    } finally {
      setConfirming(false);
    }
  }, [onSuccess]);

  if (!sent) {
    return (
      <div className="space-y-4 py-2">
        <p className="text-xs text-muted-foreground">
          We'll email you a 6-digit code to confirm. Each login will then require a
          fresh emailed code.
        </p>
        {setupError && <p className="text-xs text-destructive font-medium">{setupError}</p>}
        <button
          type="button"
          onClick={sendCode}
          disabled={sending}
          className="w-full h-9 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {sending ? "Sending..." : "Send code"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Enter the 6-digit code we sent to your email.
      </p>
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
      {confirmError && <p className="text-xs text-destructive font-medium">{confirmError}</p>}

      <button
        type="button"
        onClick={() => code.length === 6 && confirm(code)}
        disabled={confirming || code.length !== 6}
        className="w-full h-9 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
        {confirming ? "Verifying..." : "Enable email codes"}
      </button>

      <button
        type="button"
        onClick={sendCode}
        disabled={sending}
        className="w-full text-xs text-primary hover:underline disabled:text-muted-foreground"
      >
        Resend code
      </button>
    </div>
  );
};

export default EmailOtpSetup;
