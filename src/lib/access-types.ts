// ══════════════════════════════════════════════════════════════
// Access Allocation Types — Role-based visibility from Payroll
// ══════════════════════════════════════════════════════════════

import type { EmployeeRole } from './ess-types';

/** Access allocation returned by the payroll-driven API */
export interface AccessAllocation {
  user_id: number;
  role: EmployeeRole;
  /** City IDs this user can access (managers get cities) */
  cities: number[];
  /** Unit IDs this user can access (supervisors get units) */
  units: number[];
}

/** Persisted access data stored in localStorage */
export interface AccessState {
  allocation: AccessAllocation | null;
  /** Label for the user's access scope (for UI display) */
  scopeLabel: string;
  /** When access was last fetched */
  fetchedAt: string;
  /** Whether access data is valid (not stale) */
  isValid: boolean;
  /** Schema version — bump to force-clear stale cached data */
  version: number;
}

/** Access level determining what a user can do */
export type AccessLevel = 'full' | 'city' | 'unit' | 'self' | 'none';

/** City option for filters */
export interface CityOption {
  id: number;
  name: string;
  state?: string;
}

/** Unit option with city info for filters */
export interface UnitOptionWithCity {
  id: number;
  name: string;
  city?: string;
  city_id?: number;
  client_name?: string;
  client_id?: number;
}

/** Permission check result */
export interface PermissionResult {
  canView: boolean;
  accessLevel: AccessLevel;
  reason?: string;
}

// localStorage key
export const ACCESS_STORAGE_KEY = 'ess_access';
