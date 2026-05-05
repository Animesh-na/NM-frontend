import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { clearStoredAuthSession, getStoredAuthToken, isAuthTokenExpired, SESSION_EXPIRED_EVENT } from "@/utils/authToken";

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
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  token: null,
  login: async () => ({ success: false }),
  logout: () => {},
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const STORAGE_KEY_TOKEN = "voyagecalc_token";
const STORAGE_KEY_USER = "voyagecalc_user";

const VALIDATE_INTERVAL_MS = 2 * 60 * 1000; // Check every 2 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredAuthToken());
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      if (!getStoredAuthToken()) return null;
      const stored = localStorage.getItem(STORAGE_KEY_USER);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionExpiredShownRef = useRef(false);

  const isAuthenticated = !!token && !!user;

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    clearStoredAuthSession();
  }, []);

  const handleSessionExpired = useCallback((message?: string) => {
    if (sessionExpiredShownRef.current) return;
    sessionExpiredShownRef.current = true;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    clearSession();
    toast({
      title: "Session Expired",
      description: message || "Your session is inactive or has expired. Please log in again.",
      variant: "destructive",
    });
  }, [clearSession]);

  const validateToken = useCallback(async (currentToken: string) => {
    if (isAuthTokenExpired(currentToken)) {
      handleSessionExpired();
      return false;
    }

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
        handleSessionExpired();
        return false;
      }

      const data = await response.json().catch(() => null);
      if (data?.valid === false) {
        handleSessionExpired();
        return false;
      }

      return true;
    } catch (err) {
      console.error("Token validation error:", err);
      // Don't expire on network errors — only on explicit invalid token response
      return true;
    }
  }, [handleSessionExpired]);

  // Periodic token validation
  useEffect(() => {
    if (!token) return;

    validateToken(token);

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

  // Handle forced session expiration from API layer on 401
  useEffect(() => {
    const onSessionExpired = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      handleSessionExpired(detail?.message);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    };
  }, [handleSessionExpired]);

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
        sessionExpiredShownRef.current = false;
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
    sessionExpiredShownRef.current = false;
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
