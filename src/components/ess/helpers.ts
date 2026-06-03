// ══════════════════════════════════════════════════════════════
// ESS Helpers — Role logic, formatting, utilities
// ══════════════════════════════════════════════════════════════

import type { Employee, EmployeeRole } from '@/lib/ess-types';

// ── Role Detection ──────────────────────────────────────────
export function detectRole(employee: Employee): EmployeeRole {
  const category = (employee.worker_category || '').toLowerCase();
  const role = (employee.employee_role || '').toLowerCase();
  const designation = (employee.designation || '').toLowerCase();

  // Admin
  if (role === 'admin') return 'admin';

  // Regional Manager
  if (category.includes('regional') || role.includes('regional')) return 'regional_manager';

  // Field Officer (specific role before manager check)
  if (category.includes('field officer') || designation.includes('field officer')) return 'field_officer';

  // Manager / Area Manager
  if (role === 'manager' || category.includes('manager') || category.includes('area manager') || designation.includes('area manager')) return 'manager';

  // Supervisor / Team Lead
  if (category.includes('supervisor') || category.includes('team lead') || role.includes('supervisor')) return 'supervisor';

  return 'employee';
}

// ── Directory Visibility ──────────────────────────────────
export function canViewDirectory(role: EmployeeRole): boolean {
  return role === 'manager' || role === 'regional_manager' || role === 'field_officer' || role === 'admin';
}

export function canApprove(role: EmployeeRole): boolean {
  return role !== 'employee';
}

export function getScope(role: EmployeeRole): string {
  switch (role) {
    case 'admin': return 'all';
    case 'regional_manager': return 'all';
    case 'manager': return 'city';
    case 'field_officer': return 'city';
    case 'supervisor': return 'unit';
    default: return 'self';
  }
}

export function getRoleBadge(role: EmployeeRole): { label: string; className: string } {
  switch (role) {
    case 'admin': return { label: 'Admin', className: 'bg-red-100 text-red-700 border-red-200' };
    case 'regional_manager': return { label: 'Regional Manager', className: 'bg-purple-100 text-purple-700 border-purple-200' };
    case 'field_officer': return { label: 'Field Officer', className: 'bg-orange-100 text-orange-700 border-orange-200' };
    case 'manager': return { label: 'Manager', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'supervisor': return { label: 'Supervisor', className: 'bg-teal-100 text-teal-700 border-teal-200' };
    default: return { label: 'Employee', className: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

// ── Greeting ───────────────────────────────────────────────
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── String Formatting ──────────────────────────────────────
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── IST-safe date helpers ──────────────────────────────────
export function todayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function getCurrentISTDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

export function getISTMonthKey(): string {
  const ist = getCurrentISTDate();
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}`;
}

/** Parse a datetime string into an IST Date object */
export function parseIST(datetimeString: string): Date {
  return new Date(
    new Date(datetimeString).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
  );
}
