// Admin API Service - User management and admin sheet access
import { apiRequest } from "./marineApi";
import { getApiMode } from "./apiMode";

// ── Types ──

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  mfa_method?: string;        // "" / "totp" / "email_otp" — empty means MFA not set
  mfa_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUserListResponse {
  users: AdminUser[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface AdminSheetItem {
  id: string;
  user_id: string;
  name: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AdminSheetListResponse {
  sheets: AdminSheetItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

// ── Admin User APIs ──

export async function adminListUsers(page: number = 1, limit: number = 20): Promise<AdminUserListResponse> {
  try {
    return await apiRequest<AdminUserListResponse>("/admin/users", { page, limit }, { authenticated: true });
  } catch (error) {
    console.error("Failed to list users:", error);
    return { users: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

export async function adminCreateUser(email: string, password: string): Promise<AdminUser | null> {
  try {
    const data = await apiRequest<{ user: AdminUser }>("/admin/users", undefined, {
      method: "POST",
      body: { email, password },
      authenticated: true,
    });
    return data.user || null;
  } catch (error) {
    console.error("Failed to create user:", error);
    return null;
  }
}

export async function adminDeactivateUser(userId: string): Promise<boolean> {
  try {
    await apiRequest<{ message: string }>(`/admin/users/${userId}`, undefined, {
      method: "DELETE",
      authenticated: true,
    });
    return true;
  } catch (error) {
    console.error("Failed to deactivate user:", error);
    return false;
  }
}

// Reset (remove) a user's MFA — the only way to recover a user who lost their
// authenticator device. Returns the server message on success, null on failure.
export async function adminResetUserMfa(userId: string): Promise<string | null> {
  try {
    const data = await apiRequest<{ message: string }>(`/admin/users/${userId}/mfa`, undefined, {
      method: "DELETE",
      authenticated: true,
    });
    return data.message || "MFA reset";
  } catch (error) {
    console.error("Failed to reset user MFA:", error);
    return null;
  }
}

export async function adminUpdateUser(userId: string, updates: { email?: string; is_active?: boolean }): Promise<AdminUser | null> {
  try {
    const data = await apiRequest<{ user: AdminUser }>(`/admin/users/${userId}`, undefined, {
      method: "PUT",
      body: updates,
      authenticated: true,
    });
    return data.user || null;
  } catch (error) {
    console.error("Failed to update user:", error);
    return null;
  }
}

// ── Admin Sheet APIs ──

export async function adminListSheets(
  page: number = 1,
  limit: number = 10,
  userId?: string
): Promise<AdminSheetListResponse> {
  try {
    const params: Record<string, string | number> = { page, limit };
    if (userId) params.user_id = userId;
    return await apiRequest<AdminSheetListResponse>(`/admin/${getApiMode()}/sheets`, params, { authenticated: true });
  } catch (error) {
    console.error("Failed to list admin sheets:", error);
    return { sheets: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}
