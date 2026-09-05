// Admin API Service - User management and admin sheet access
import { apiRequest } from "./marineApi";
import { getApiMode } from "./apiMode";

// ── Types ──

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  expires_at?: string | null;
  dry_bulk_access?: boolean;
  tanker_access?: boolean;
  mfa_method?: string;        // "" / "totp" / "email_otp" — empty means MFA not set
  mfa_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

// Payload accepted by the admin user update / create endpoints.
export interface AdminUserPermissionsPayload {
  email?: string;
  password?: string;
  is_active?: boolean;
  expires_at?: string | null;
  dry_bulk_access?: boolean;
  tanker_access?: boolean;
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

export async function adminCreateUser(
  email: string,
  password: string,
  permissions?: Omit<AdminUserPermissionsPayload, "email" | "password">,
): Promise<AdminUser | null> {
  try {
    const data = await apiRequest<{ user: AdminUser }>("/admin/users", undefined, {
      method: "POST",
      body: { email, password, ...(permissions || {}) },
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

export async function adminUpdateUser(
  userId: string,
  updates: AdminUserPermissionsPayload,
): Promise<AdminUser | null> {
  try {
    // Strip undefined keys so partial updates don't overwrite server values.
    const body = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    );
    const data = await apiRequest<{ user: AdminUser }>(`/admin/users/${userId}`, undefined, {
      method: "PUT",
      body,
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

// ── Admin Organization APIs ──

export interface AdminOrganization {
  id: string;
  name: string;
  description?: string | null;
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AdminOrganizationMember {
  id: string;
  email: string;
  role?: string;
  is_active?: boolean;
  joined_at?: string;
}

export interface AdminOrganizationListResponse {
  organizations: AdminOrganization[];
  pagination: { total: number; page: number; limit: number; total_pages: number };
}

export interface AdminOrganizationDetail extends AdminOrganization {
  users?: AdminOrganizationMember[];
  members?: AdminOrganizationMember[];
}

export async function adminListOrganizations(page: number = 1, limit: number = 20): Promise<AdminOrganizationListResponse> {
  try {
    const res = await apiRequest<AdminOrganizationListResponse>("/admin/organizations", { page, limit }, { authenticated: true });
    return {
      organizations: res.organizations || [],
      pagination: res.pagination || { total: 0, page, limit, total_pages: 1 },
    };
  } catch (error) {
    console.error("Failed to list organizations:", error);
    return { organizations: [], pagination: { total: 0, page, limit, total_pages: 1 } };
  }
}

export async function adminCreateOrganization(name: string, description?: string): Promise<AdminOrganization | null> {
  try {
    const data = await apiRequest<{ organization?: AdminOrganization } & AdminOrganization>(
      "/admin/organizations",
      undefined,
      { method: "POST", body: { name, description: description || "" }, authenticated: true },
    );
    return data.organization || (data.id ? data : null);
  } catch (error) {
    console.error("Failed to create organization:", error);
    return null;
  }
}

export async function adminGetOrganization(orgId: string): Promise<AdminOrganizationDetail | null> {
  try {
    const data = await apiRequest<{ organization?: AdminOrganizationDetail } & AdminOrganizationDetail>(
      `/admin/organizations/${orgId}`,
      undefined,
      { authenticated: true },
    );
    return data.organization || data || null;
  } catch (error) {
    console.error("Failed to load organization:", error);
    return null;
  }
}

export async function adminAddUserToOrganization(orgId: string, userId: string): Promise<boolean> {
  try {
    await apiRequest<{ message?: string }>(`/admin/organizations/${orgId}/users`, undefined, {
      method: "POST",
      body: { user_id: userId },
      authenticated: true,
    });
    return true;
  } catch (error) {
    console.error("Failed to add user to organization:", error);
    return false;
  }
}

// ── Admin Cache APIs ──

export async function adminClearCache(): Promise<{ success: boolean; message?: string }> {
  try {
    const data = await apiRequest<{ message?: string }>("/admin/cache/clear", undefined, {
      method: "POST",
      authenticated: true,
    });
    return { success: true, message: data.message || "Cache cleared" };
  } catch (error) {
    console.error("Failed to clear cache:", error);
    return { success: false, message: "Failed to clear cache" };
  }
}
