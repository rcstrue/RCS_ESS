import { apiRequest } from '@/lib/api/config';
import type {
  LoginResponse, AttendanceRecord, AttendanceSummary,
  LeaveRequest, LeaveBalance, Task, Expense,
  HelpdeskTicket, Announcement, PaginatedResponse,
  ClientOption, UnitOption, Employee
} from './ess-types';

// ══════════════════════════════════════════════════════════════
// unwrap - PHP wraps responses in { success, message, data }
// apiRequest gives { data: <PHP envelope>, error }
// This helper strips the envelope so callers get the actual payload
// ══════════════════════════════════════════════════════════════
function unwrap<T>(result: Promise<{ data: T | null; error: string | null }>): Promise<{ data: T | null; error: string | null }> {
  return result.then((res) => {
    if (res.error) return res;
    const d = res.data as Record<string, unknown> | null;
    if (d && typeof d === 'object' && 'success' in d && 'data' in d) {
      return { data: d.data as T, error: null };
    }
    return res;
  });
}

// ===== Auth =====
export async function essLogin(mobileNumber: string, pin: string) {
  return unwrap<LoginResponse>(apiRequest<LoginResponse>('/ess/login', {
    method: 'POST',
    body: JSON.stringify({ mobileNumber, pin }),
  }));
}

export async function changePin(employee_id: number, current_pin: string, new_pin: string) {
  return unwrap(apiRequest('/ess/pin', {
    method: 'POST',
    body: JSON.stringify({ employee_id, current_pin, new_pin }),
  }));
}

// ===== Attendance =====
export async function fetchAttendance(employee_id: number, month?: string) {
  const params = new URLSearchParams({ employee_id: String(employee_id) });
  if (month) params.set('month', month);
  return unwrap<PaginatedResponse<AttendanceRecord>>(apiRequest<PaginatedResponse<AttendanceRecord>>(`/ess/attendance?${params}`));
}

export async function checkIn(data: { employee_id: number; location?: string }) {
  return unwrap<AttendanceRecord>(apiRequest<AttendanceRecord>('/ess/attendance', {
    method: 'POST',
    body: JSON.stringify(data),
  }));
}

export async function checkOut(id: number) {
  return unwrap<AttendanceRecord>(apiRequest<AttendanceRecord>('/ess/attendance', {
    method: 'PUT',
    body: JSON.stringify({ id }),
  }));
}

// ===== Leaves =====
export async function fetchLeaves(employee_id: number, status?: string) {
  const params = new URLSearchParams({ employee_id: String(employee_id) });
  if (status) params.set('status', status);
  return unwrap<PaginatedResponse<LeaveRequest>>(apiRequest<PaginatedResponse<LeaveRequest>>(`/ess/leaves?${params}`));
}

export async function fetchLeaveBalance(employee_id: number) {
  return unwrap<LeaveBalance[]>(apiRequest<LeaveBalance[]>(`/ess/leaves?employee_id=${employee_id}&view=balance`));
}

export async function applyLeave(data: { employee_id: number; type: string; start_date: string; end_date: string; days: number; reason: string }) {
  return unwrap<LeaveRequest>(apiRequest<LeaveRequest>('/ess/leaves', {
    method: 'POST',
    body: JSON.stringify(data),
  }));
}

export async function approveLeave(id: number, status: string, approved_by: number, rejection_reason?: string) {
  return unwrap<LeaveRequest>(apiRequest<LeaveRequest>('/ess/leaves', {
    method: 'PUT',
    body: JSON.stringify({ id, status, approved_by, rejection_reason }),
  }));
}

// ===== Tasks =====
export async function fetchTasks(params: { assigned_to?: number; assigned_by?: number; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params.assigned_to) searchParams.set('assigned_to', String(params.assigned_to));
  if (params.assigned_by) searchParams.set('assigned_by', String(params.assigned_by));
  if (params.status) searchParams.set('status', params.status);
  return unwrap<PaginatedResponse<Task>>(apiRequest<PaginatedResponse<Task>>(`/ess/tasks?${searchParams}`));
}

export async function createTask(data: { title: string; description?: string; priority: string; deadline?: string; assigned_to?: number }) {
  return unwrap<Task>(apiRequest<Task>('/ess/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  }));
}

export async function updateTask(id: number, data: Partial<Task>) {
  return unwrap<Task>(apiRequest<Task>('/ess/tasks', {
    method: 'PUT',
    body: JSON.stringify({ id, ...data }),
  }));
}

// ===== Expenses =====
export async function fetchExpenses(employee_id: number, status?: string) {
  const params = new URLSearchParams({ employee_id: String(employee_id) });
  if (status) params.set('status', status);
  return unwrap<PaginatedResponse<Expense>>(apiRequest<PaginatedResponse<Expense>>(`/ess/expenses?${params}`));
}

export async function createExpense(data: { employee_id: number; type: string; amount: number; expense_date: string; description?: string }) {
  return unwrap<Expense>(apiRequest<Expense>('/ess/expenses', {
    method: 'POST',
    body: JSON.stringify(data),
  }));
}

export async function approveExpense(id: number, status: string, approved_by: number, rejection_reason?: string) {
  return unwrap<Expense>(apiRequest<Expense>('/ess/expenses', {
    method: 'PUT',
    body: JSON.stringify({ id, status, approved_by, rejection_reason }),
  }));
}

// ===== Helpdesk =====
export async function fetchHelpdeskTickets(employee_id: number, status?: string) {
  const params = new URLSearchParams({ employee_id: String(employee_id) });
  if (status) params.set('status', status);
  return unwrap<PaginatedResponse<HelpdeskTicket>>(apiRequest<PaginatedResponse<HelpdeskTicket>>(`/ess/helpdesk?${params}`));
}

export async function createHelpdeskTicket(data: { employee_id: number; category: string; subject: string; description?: string; priority: string }) {
  return unwrap<HelpdeskTicket>(apiRequest<HelpdeskTicket>('/ess/helpdesk', {
    method: 'POST',
    body: JSON.stringify(data),
  }));
}

// ===== Announcements =====
export async function fetchAnnouncements(target_scope?: string, target_id?: number) {
  const params = new URLSearchParams();
  if (target_scope) params.set('target_scope', target_scope);
  if (target_id) params.set('target_id', String(target_id));
  return unwrap<Announcement[]>(apiRequest<Announcement[]>(`/ess/announcements?${params}`));
}

export async function createAnnouncement(data: { title: string; content: string; priority: string; target_scope: string; target_id?: number }) {
  return unwrap<Announcement>(apiRequest<Announcement>('/ess/announcements', {
    method: 'POST',
    body: JSON.stringify(data),
  }));
}

// ===== Filters =====
export async function fetchClients(scope?: string, requester_id?: number) {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  if (requester_id) params.set('requester_id', String(requester_id));
  return unwrap<ClientOption[]>(apiRequest<ClientOption[]>(`/ess/filters?view=clients&${params}`));
}

export async function fetchUnits(scope?: string, requester_id?: number, client_id?: number) {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  if (requester_id) params.set('requester_id', String(requester_id));
  if (client_id) params.set('client_id', String(client_id));
  return unwrap<UnitOption[]>(apiRequest<UnitOption[]>(`/ess/filters?view=units&${params}`));
}

// ===== Employees (Directory) =====
export async function fetchEmployees(params: { scope?: string; requester_id?: number; limit?: number; page?: number; q?: string; client_id?: number; unit_id?: number }) {
  const searchParams = new URLSearchParams();
  if (params.scope) searchParams.set('scope', params.scope);
  if (params.requester_id) searchParams.set('requester_id', String(params.requester_id));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.page) searchParams.set('page', String(params.page));
  if (params.q) searchParams.set('q', params.q);
  if (params.client_id) searchParams.set('client_id', String(params.client_id));
  if (params.unit_id) searchParams.set('unit_id', String(params.unit_id));
  return unwrap<PaginatedResponse<Employee>>(apiRequest<PaginatedResponse<Employee>>(`/ess/employees?${searchParams}`));
}

// ===== Profile =====
export async function fetchProfile(employee_id: number) {
  return unwrap<{ employee: Employee; attendance_summary: AttendanceSummary; leave_balance: LeaveBalance[]; recent_attendance: AttendanceRecord[] }>(
    apiRequest<{ employee: Employee; attendance_summary: AttendanceSummary; leave_balance: LeaveBalance[]; recent_attendance: AttendanceRecord[] }>(`/ess/filters?view=profile&employee_id=${employee_id}`)
  );
}
