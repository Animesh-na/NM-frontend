const STORAGE_KEY_TOKEN = "voyagecalc_token";
const STORAGE_KEY_USER = "voyagecalc_user";

export const SESSION_EXPIRED_EVENT = "voyagecalc:session-expired";

type JwtPayload = {
  exp?: number;
};

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isAuthTokenExpired(token: string | null, leewaySeconds = 30): boolean {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp <= Math.floor(Date.now() / 1000) + leewaySeconds;
}

export function clearStoredAuthSession() {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
}

export function getStoredAuthToken(): string | null {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (isAuthTokenExpired(token)) {
    clearStoredAuthSession();
    return null;
  }
  return token;
}

export function dispatchSessionExpired(message?: string) {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message } }));
}