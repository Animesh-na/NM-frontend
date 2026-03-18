import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

interface AuthUser {
  id: string;
  email: string;
  role: string;
  expires_at: string | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  token: null,
  login: async () => ({ success: false }),
  logout: () => {},
  sessionExpired: false,
  dismissSessionExpired: () => {},
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const STORAGE_KEY_TOKEN = "voyagecalc_token";
const STORAGE_KEY_USER = "voyagecalc_user";

const VALIDATE_INTERVAL_MS = 2 * 60 * 1000; // Check every 2 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY_TOKEN));
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_USER);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [sessionExpired, setSessionExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAuthenticated = !!token && !!user && !sessionExpired;

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
  }, []);

  const handleSessionExpired = useCallback(() => {
    setSessionExpired(true);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const validateToken = useCallback(async (currentToken: string) => {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/marine-api?endpoint=/auth/validate`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            "X-Auth-Token": currentToken,
          },
        }
      );

      if (!response.ok) {
        console.warn("Token validation failed:", response.status);
        handleSessionExpired();
        return false;
      }

      const data = await response.json();
      if (data.valid === false) {
        console.warn("Token expired:", data.reason);
        handleSessionExpired();
        return false;
      }

      return true;
    } catch (err) {
      console.error("Token validation error:", err);
      // Don't expire on network errors — only on explicit 401
      return true;
    }
  }, [handleSessionExpired]);

  // Periodic token validation
  useEffect(() => {
    if (!token) return;

    // Validate immediately on mount/login
    validateToken(token);

    // Set up periodic validation
    intervalRef.current = setInterval(() => {
      const currentToken = localStorage.getItem(STORAGE_KEY_TOKEN);
      if (currentToken) {
        validateToken(currentToken);
      }
    }, VALIDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [token, validateToken]);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/marine-api?endpoint=/auth/signin`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return { success: false, error: errData.error || errData.message || "Invalid credentials" };
      }

      const data = await response.json();
      
      if (data.token && data.user) {
        setSessionExpired(false);
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.user));
        return { success: true };
      }

      return { success: false, error: "Invalid response from server" };
    } catch (err) {
      console.error("Login error:", err);
      return { success: false, error: "Network error. Please try again." };
    }
  }, []);

  const logout = useCallback(() => {
    setSessionExpired(false);
    clearSession();
  }, [clearSession]);

  const dismissSessionExpired = useCallback(() => {
    setSessionExpired(false);
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, token, login, logout, sessionExpired, dismissSessionExpired }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
