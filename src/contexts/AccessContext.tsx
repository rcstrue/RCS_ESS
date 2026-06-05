'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import type {
  AccessAllocation,
  AccessState,
  AccessLevel,
  PermissionResult,
  CityOption,
} from '@/lib/access-types';
import { ACCESS_STORAGE_KEY } from '@/lib/access-types';
import { apiRequest } from '@/lib/api/config';
import type { EmployeeRole } from '@/lib/ess-types';

// ══════════════════════════════════════════════════════════════
// API Layer
// ══════════════════════════════════════════════════════════════

async function fetchAccessFromServer(): Promise<AccessAllocation | null> {
  try {
    const { data, error } = await apiRequest<{
      user_id: number;
      role: EmployeeRole;
      cities: number[];
      units: number[];
      cities_detail: { id: number; name: string; state: string }[];
    }>('/ess/access');

    if (error || !data) return null;

    return {
      user_id: data.user_id,
      role: data.role,
      cities: data.cities,
      units: data.units,
    };
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// localStorage helpers
// ══════════════════════════════════════════════════════════════

function loadAccessFromStorage(): AccessState | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(ACCESS_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as AccessState;
    // Consider stale after 24 hours
    const age = Date.now() - new Date(parsed.fetchedAt).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      parsed.isValid = false;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveAccessToStorage(state: AccessState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function clearAccessStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACCESS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ══════════════════════════════════════════════════════════════
// Permission Helpers
// ══════════════════════════════════════════════════════════════

function getAccessLevel(role: EmployeeRole): AccessLevel {
  switch (role) {
    case 'admin':
    case 'regional_manager':
      return 'full';
    case 'manager':
    case 'field_officer':
      return 'city';
    case 'supervisor':
      return 'unit';
    default:
      return 'self';
  }
}

function getScopeLabel(role: EmployeeRole, cities: number[], units: number[]): string {
  switch (role) {
    case 'admin':
      return 'All Employees';
    case 'regional_manager':
      return 'All Locations';
    case 'manager':
    case 'field_officer':
      return cities.length > 0
        ? `${cities.length} ${cities.length === 1 ? 'City' : 'Cities'}`
        : 'Assigned Cities';
    case 'supervisor':
      return units.length > 0
        ? `${units.length} ${units.length === 1 ? 'Unit' : 'Units'}`
        : 'Assigned Units';
    default:
      return 'Self Only';
  }
}

// ══════════════════════════════════════════════════════════════
// Context Definition
// ══════════════════════════════════════════════════════════════

interface AccessContextValue {
  /** The access allocation (null = not loaded yet) */
  allocation: AccessAllocation | null;
  /** Whether access data has been loaded */
  isLoaded: boolean;
  /** Whether currently fetching access */
  isLoading: boolean;
  /** Human-readable scope label */
  scopeLabel: string;
  /** Access level */
  accessLevel: AccessLevel;
  /** Comma-separated city IDs string for API params */
  cityIdsParam: string;
  /** Comma-separated unit IDs string for API params */
  unitIdsParam: string;

  // Permission helpers
  canViewEmployee(): boolean;
  canViewAttendance(): boolean;
  canViewLeave(): boolean;
  canViewExpense(): boolean;
  canViewAdvance(): boolean;
  canViewDirectory(): boolean;
  checkPermission(resource: string): PermissionResult;

  // Actions
  refreshAccess(): Promise<void>;
  clearAccess(): void;
}

const AccessContext = createContext<AccessContextValue | null>(null);

// ══════════════════════════════════════════════════════════════
// Provider Component
// ══════════════════════════════════════════════════════════════

export function AccessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessState | null>(() => loadAccessFromStorage());
  const [isLoading, setIsLoading] = useState(false);

  const allocation = state?.allocation ?? null;
  const isLoaded = state !== null;
  const role = allocation?.role ?? 'employee';
  const accessLevel = useMemo(() => getAccessLevel(role), [role]);
  const scopeLabel = useMemo(
    () => getScopeLabel(role, allocation?.cities ?? [], allocation?.units ?? []),
    [role, allocation?.cities, allocation?.units],
  );
  const cityIdsParam = useMemo(
    () => (allocation?.cities && allocation.cities.length > 0 ? allocation.cities.join(',') : ''),
    [allocation?.cities],
  );
  const unitIdsParam = useMemo(
    () => (allocation?.units && allocation.units.length > 0 ? allocation.units.join(',') : ''),
    [allocation?.units],
  );

  // ── Fetch access from server ──
  const refreshAccess = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAccessFromServer();
      if (data) {
        const newState: AccessState = {
          allocation: data,
          scopeLabel: getScopeLabel(data.role, data.cities, data.units),
          fetchedAt: new Date().toISOString(),
          isValid: true,
        };
        setState(newState);
        saveAccessToStorage(newState);
      } else {
        // Fallback: use stored data if available
        const stored = loadAccessFromStorage();
        if (stored) {
          setState({ ...stored, isValid: false });
        } else {
          // No access data at all — create minimal state
          setState({
            allocation: null,
            scopeLabel: 'Unknown',
            fetchedAt: new Date().toISOString(),
            isValid: false,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch access:', err);
      const stored = loadAccessFromStorage();
      if (stored) {
        setState({ ...stored, isValid: false });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Clear access (on logout) ──
  const clearAccess = useCallback(() => {
    setState(null);
    clearAccessStorage();
  }, []);

  // ── Restore from storage on mount ──
  useEffect(() => {
    const stored = loadAccessFromStorage();
    if (stored?.allocation) {
      setState(stored);
    }
  }, []);

  // ── Permission Helpers ──
  const canViewEmployee = useCallback((): boolean => {
    if (!allocation) return false;
    return accessLevel === 'full' || accessLevel === 'city' || accessLevel === 'unit';
  }, [allocation, accessLevel]);

  const canViewAttendance = useCallback((): boolean => {
    if (!allocation) return false;
    return true; // All authenticated users can view their own attendance
  }, [allocation]);

  const canViewLeave = useCallback((): boolean => {
    if (!allocation) return false;
    return true; // All authenticated users can view their own leaves
  }, [allocation]);

  const canViewExpense = useCallback((): boolean => {
    if (!allocation) return false;
    return true; // All authenticated users can view their own expenses
  }, [allocation]);

  const canViewAdvance = useCallback((): boolean => {
    if (!allocation) return false;
    return true; // All authenticated users can view their own advances
  }, [allocation]);

  const canViewDirectory = useCallback((): boolean => {
    if (!allocation) return false;
    return accessLevel === 'full' || accessLevel === 'city' || accessLevel === 'unit';
  }, [allocation, accessLevel]);

  const checkPermission = useCallback(
    (resource: string): PermissionResult => {
      const viewFn: Record<string, () => boolean> = {
        employees: canViewEmployee,
        attendance: canViewAttendance,
        leave: canViewLeave,
        expense: canViewExpense,
        advance: canViewAdvance,
        directory: canViewDirectory,
      };
      const canView = viewFn[resource]?.() ?? false;
      return {
        canView,
        accessLevel,
        reason: canView ? undefined : `You don't have permission to view ${resource}`,
      };
    },
    [canViewEmployee, canViewAttendance, canViewLeave, canViewExpense, canViewAdvance, canViewDirectory, accessLevel],
  );

  const value = useMemo<AccessContextValue>(
    () => ({
      allocation,
      isLoaded,
      isLoading,
      scopeLabel,
      accessLevel,
      cityIdsParam,
      unitIdsParam,
      canViewEmployee,
      canViewAttendance,
      canViewLeave,
      canViewExpense,
      canViewAdvance,
      canViewDirectory,
      checkPermission,
      refreshAccess,
      clearAccess,
    }),
    [
      allocation, isLoaded, isLoading, scopeLabel, accessLevel,
      cityIdsParam, unitIdsParam,
      canViewEmployee, canViewAttendance, canViewLeave,
      canViewExpense, canViewAdvance, canViewDirectory,
      checkPermission, refreshAccess, clearAccess,
    ],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

// ══════════════════════════════════════════════════════════════
// Hook
// ══════════════════════════════════════════════════════════════

export function useAccess(): AccessContextValue {
  const ctx = useContext(AccessContext);
  if (!ctx) {
    throw new Error('useAccess must be used within an <AccessProvider>');
  }
  return ctx;
}

// Re-export types for convenience
export type { CityOption };
