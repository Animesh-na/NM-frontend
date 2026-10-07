// MFA / 2FA API Service — account-level (logged-in) MFA management.
// Calls the Go API like marineApi, with the session JWT. Unlike apiRequest in marineApi.ts, this surfaces the HTTP status
// and parsed body on errors so callers can map 401/403/409/429/503 to UX.
import { dispatchSessionExpired, getStoredAuthToken } from "@/utils/authToken";
import { buildMarineUrl, marineHeaders } from "./apiConfig";

export type MfaMethod = "" | "email_otp" | "totp";

export interface MfaStatus {
  mfa_enabled: boolean;
  mfa_method: MfaMethod;
}

export interface TotpSetupResponse {
  secret: string;
  otpauth_url: string;
}

// Error that preserves the HTTP status and parsed body for status-code mapping.
export class MfaApiError extends Error {
  status: number;
  body: Record<string, unknown> | null;

  constructor(status: number, body: Record<string, unknown> | null) {
    const serverMsg =
      (body && (body.error as string)) || (body && (body.message as string));
    super(serverMsg || `MFA request failed (${status})`);
    this.name = "MfaApiError";
    this.status = status;
    this.body = body;
  }
}

// Strip whitespace and keep only digits — codes are 6-digit numeric.
export function sanitizeCode(code: string): string {
  return code.replace(/\D/g, "");
}

async function mfaRequest<T>(
  endpoint: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const token = getStoredAuthToken();
  if (!token) {
    dispatchSessionExpired();
    throw new MfaApiError(401, { error: "Session expired" });
  }

  const fetchOptions: RequestInit = {
    method: options?.method || "GET",
    headers: marineHeaders({ Authorization: `Bearer ${token}` }),
  };

  if (options?.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildMarineUrl(endpoint), fetchOptions);

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // NOTE: do NOT treat a 401 here as session expiry. On confirm/disable a 401
    // means "wrong code" / "wrong password" — surfacing it as a logout would kick
    // the user out mid-setup. Genuine session expiry is already handled above by
    // the getStoredAuthToken() pre-check (and by AuthContext's periodic validator).
    throw new MfaApiError(response.status, data);
  }

  return data as T;
}

// 4. GET /account/mfa
export function getMfaStatus(): Promise<MfaStatus> {
  return mfaRequest<MfaStatus>("/account/mfa");
}

// 5. POST /account/mfa/email/setup — emails a code (may 409 / 503)
export function emailSetup(): Promise<{ sent: boolean }> {
  return mfaRequest<{ sent: boolean }>("/account/mfa/email/setup", { method: "POST" });
}

// 6. POST /account/mfa/email/confirm
export function emailConfirm(code: string): Promise<MfaStatus> {
  return mfaRequest<MfaStatus>("/account/mfa/email/confirm", {
    method: "POST",
    body: { code: sanitizeCode(code) },
  });
}

// 7. POST /account/mfa/totp/setup
export function totpSetup(): Promise<TotpSetupResponse> {
  return mfaRequest<TotpSetupResponse>("/account/mfa/totp/setup", { method: "POST" });
}

// 8. POST /account/mfa/totp/confirm
export function totpConfirm(code: string): Promise<MfaStatus> {
  return mfaRequest<MfaStatus>("/account/mfa/totp/confirm", {
    method: "POST",
    body: { code: sanitizeCode(code) },
  });
}

// 9. POST /account/mfa/disable — requires password re-auth
export function disableMfa(password: string): Promise<{ mfa_enabled: false }> {
  return mfaRequest<{ mfa_enabled: false }>("/account/mfa/disable", {
    method: "POST",
    body: { password },
  });
}
