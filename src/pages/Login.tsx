import { useState } from "react";
import { Ship, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import loginBg from "@/assets/login-bg.jpg";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    const result = await login(email, password);
    
    if (!result.success) {
      setError(result.error || "Invalid login credentials");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="bg-card border border-border rounded-md shadow-sm p-6">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-3">
              <Ship className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">VoyageCalc</h1>
            <p className="text-xs text-muted-foreground mt-1">Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Email / User ID
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input w-full h-9 px-3 text-sm"
                placeholder="Enter your email"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input w-full h-9 px-3 text-sm"
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-xs text-destructive font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
