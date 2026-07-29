import { useState } from "react";
import { Ship, Loader2, ShieldCheck, Anchor, BarChart3 } from "lucide-react";
import { useAuth, type MfaMethod } from "@/context/AuthContext";
import MfaVerifyForm from "@/components/mfa/MfaVerifyForm";
import loginBg from "@/assets/login-bg.jpg";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingMfa, setPendingMfa] = useState<{ challengeToken: string; method: MfaMethod } | null>(null);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email, password);

    if ("mfaRequired" in result) {
      setPendingMfa({ challengeToken: result.challengeToken, method: result.mfaMethod });
    } else if (result.success === false) {
      setError(result.error || "Invalid login credentials");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left — cinematic ship panel */}
      <div
        className="relative hidden lg:flex flex-col justify-between p-10 bg-cover bg-center"
        style={{ backgroundImage: `url(${loginBg})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/90 via-primary/70 to-primary/30" />
        <div className="relative z-10 flex items-center gap-2 text-primary-foreground">
          <div className="w-9 h-9 rounded-lg bg-primary-foreground/15 backdrop-blur-sm flex items-center justify-center">
            <Ship className="h-5 w-5" />
          </div>
          <span className="text-base font-semibold tracking-tight">VoyageCalc</span>
        </div>

        <div className="relative z-10 text-primary-foreground max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Maritime voyage estimation, built for precision.
          </h2>
          <p className="mt-3 text-sm text-primary-foreground/80">
            Model bunkers, port time, emissions and P&amp;L across dry bulk and tanker fleets — in one workspace.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { icon: Anchor, label: "Port & sea legs" },
              { icon: BarChart3, label: "Live P&L" },
              { icon: ShieldCheck, label: "EU / UK ETS" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="rounded-lg bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/15 p-3"
              >
                <Icon className="h-4 w-4 mb-2" />
                <p className="text-[11px] leading-tight text-primary-foreground/90">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — credentials */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {pendingMfa ? (
            <MfaVerifyForm
              method={pendingMfa.method}
              challengeToken={pendingMfa.challengeToken}
              onBack={() => setPendingMfa(null)}
            />
          ) : (
          <>
          <div className="mb-8">
            <div className="lg:hidden flex items-center gap-2 mb-6">
              <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                <Ship className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-base font-semibold text-foreground">VoyageCalc</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1.5">Sign in to your account to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Email / User ID
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input w-full h-11 px-3.5 text-sm rounded-lg"
                placeholder="Enter your email"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input w-full h-11 px-3.5 text-sm rounded-lg"
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-xs text-destructive font-medium bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-primary text-primary-foreground text-sm font-medium rounded-lg shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>
          <p className="mt-8 text-[11px] text-muted-foreground">
            Protected by multi-factor authentication.
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
