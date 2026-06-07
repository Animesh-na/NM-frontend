import { useState } from "react";
import { Loader2 } from "lucide-react";
import { disableMfa, MfaApiError } from "@/services/mfaApi";

interface DisableMfaProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const DisableMfa = ({ onSuccess, onCancel }: DisableMfaProps) => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await disableMfa(password);
      onSuccess();
    } catch (err) {
      const msg = err instanceof MfaApiError && err.status === 401
        ? "Incorrect password."
        : "Could not disable MFA. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Enter your password to turn off two-factor authentication.
      </p>
      <div>
        <label className="text-xs font-medium text-foreground block mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="form-input w-full h-9 px-3 text-sm"
          placeholder="Enter your password"
          required
          autoFocus
          disabled={loading}
        />
      </div>
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !password}
          className="flex-1 h-9 bg-destructive text-destructive-foreground text-sm font-medium rounded-sm hover:bg-destructive/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Disabling..." : "Disable MFA"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="btn-secondary h-9 px-4 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export default DisableMfa;
