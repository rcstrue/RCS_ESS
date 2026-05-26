import type { Employee, EmployeeRole, ESSSession, LeaveBalance, AttendanceRecord } from '@/lib/ess-types';

// ══════════════════════════════════════════════════════════════
// App-level Types
// ══════════════════════════════════════════════════════════════

export interface ESSAppProps {
  onBackToRegistration: () => void;
}

export interface DashboardData {
  leaveBalance: LeaveBalance[];
  clBalance: number;
  todayAttendance: AttendanceRecord | null;
  pendingLeaves: number;
  pendingExpenses: number;
  pendingTasks: number;
}

// Re-export commonly used types
export type { Employee, EmployeeRole, ESSSession, LeaveBalance, AttendanceRecord };
