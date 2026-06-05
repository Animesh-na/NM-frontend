import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { useAuth, type MfaMethod } from "@/context/AuthContext";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const RESEND_THROTTLE_S = 60;

interface MfaVerifyFormProps {
  method: MfaMethod;
  challengeToken: string;
  onBack: () => void;
}

const MfaVerifyForm = ({ method, challengeToken, onBack }: MfaVerifyFormProps) => {
  const { verifyMfa, resendMfaCode } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  const isEmail = method === "email_otp";

  // Count down the resend throttle window.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const submit = useCallback(async (value: string) => {
    setError("");
    setInfo("");
    setLoading(true);
    const result = await verifyMfa(challengeToken, value);
    if (!result.success) {
      setError(result.error || "Invalid or expired code.");
      setCode("");
      setTimeout(() => otpRef.current?.focus(), 0);
    }
    setLoading(false);
  }, [verifyMfa, challengeToken]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) submit(code);
  };

  const handleResend = async () => {
    setError("");
    setInfo("");
    const result = await resendMfaCode(challengeToken);
    if (result.success) {
      setInfo("A new code was sent.");
      setResendIn(RESEND_THROTTLE_S);
    } else {
      setError(result.error || "Could not resend the code.");
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-3">
        <ShieldCheck className="h-7 w-7 text-primary-foreground" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">Two-factor verification</h1>
      <p className="text-xs text-muted-foreground mt-1 mb-6 text-center">
        {isEmail
          ? "Enter the 6-digit code we emailed you."
          : "Enter the 6-digit code from your authenticator app."}
      </p>

      <form onSubmit={handleSubmit} className="w-full flex flex-col items-center space-y-4">
        <InputOTP
          ref={otpRef}
          maxLength={6}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (v.length === 6) submit(v);
          }}
          disabled={loading}
          autoFocus
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>

        {error && <p className="text-xs text-destructive font-medium">{error}</p>}
        {info && <p className="text-xs text-primary font-medium">{info}</p>}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full h-9 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Verifying..." : "Verify"}
        </button>

        {isEmail && (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendIn > 0}
            className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>
        )}

        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to login
        </button>
      </form>
    </div>
  );
};

export default MfaVerifyForm;
