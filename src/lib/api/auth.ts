// Admin Authentication API service for MySQL backend
import { apiRequest } from './config';

export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'manager';
  created_at: string;
}

export interface AuthSession {
  user: AdminUser;
  token: string;
}

// Admin login
export async function adminLogin(email: string, password: string) {
  // Clear ESS tokens to prevent token confusion between admin and ESS sessions
  localStorage.removeItem('ess_token');
  localStorage.removeItem('ess_employee');

  const result = await apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  
  if (result.data?.token) {
    localStorage.setItem('admin_token', result.data.token);
    localStorage.setItem('admin_user', JSON.stringify(result.data.user));
  }
  
  return result;
}

// Admin signup
export async function adminSignup(email: string, password: string) {
  return apiRequest<{ success: boolean; message: string }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// Admin logout
export function adminLogout() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
}

// Get current session
export function getAdminSession(): AuthSession | null {
  const token = localStorage.getItem('admin_token');
  const userStr = localStorage.getItem('admin_user');
  
  if (!token || !userStr) {
    return null;
  }
  
  try {
    const user = JSON.parse(userStr) as AdminUser;
    return { user, token };
  } catch {
    return null;
  }
}

// Check if admin is logged in
export function isAdminLoggedIn(): boolean {
  return getAdminSession() !== null;
}

// Get admin role
export function getAdminRole(): 'admin' | 'manager' | null {
  const session = getAdminSession();
  return session?.user.role || null;
}

// Verify session with server - explicitly uses admin token (not ESS token)
export async function verifySession() {
  const session = getAdminSession();
  if (!session) {
    return { data: null, error: 'No admin session found' };
  }

  return apiRequest<{ valid: boolean; user?: AdminUser }>('/auth/verify', {
    headers: {
      'Authorization': `Bearer ${session.token}`,
    },
  });
}
