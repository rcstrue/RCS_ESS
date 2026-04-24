// ===== Employee =====
export interface Employee {
  id: number;
  employee_code: string;
  full_name: string;
  father_name?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  mobile_number: string;
  alternate_mobile?: string;
  email?: string;
  marital_status?: string;
  aadhaar_number?: string;
  uan_number?: string;
  esic_number?: string;
  address?: string;
  pin_code?: string;
  state?: string;
  district?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  account_holder_name?: string;
  client_name?: string;
  client_id?: number;
  unit_name?: string;
  unit_id?: number;
  city?: string;
  date_of_joining?: string;
  confirmation_date?: string;
  probation_period?: string;
  date_of_leaving?: string;
  profile_pic_url?: string;
  profile_completion?: number;
  employee_role?: string;
  worker_category?: string;
  designation?: string;
  department?: string;
  employment_type?: string;
  status?: string;
  nominee_name?: string;
  nominee_relationship?: string;
  nominee_dob?: string;
  nominee_contact?: string;
  emergency_contact_name?: string;
  emergency_contact_relation?: string;
  approved_at?: string;
  approved_by?: number;
  created_at?: string;
  updated_at?: string;
}

export type EmployeeRole = 'employee' | 'supervisor' | 'manager' | 'regional_manager';

// ===== Auth =====
export interface LoginResponse {
  employee: Employee;
  role: EmployeeRole;
  has_custom_pin: boolean;
}

export interface ESSSession {
  employee: Employee;
  role: EmployeeRole;
}

// ===== Attendance =====
export interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  status: 'present' | 'checked_in' | 'checked_out' | 'late' | 'absent' | 'leave' | 'holiday' | 'half_day';
  check_in?: string;
  check_out?: string;
  location?: string;
}

export interface AttendanceSummary {
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
}

// ===== Leaves =====
export interface LeaveRequest {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_unit?: string;
  type: 'CL' | 'SL' | 'EL' | 'WFH' | 'Comp_Off' | 'LWP';
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejection_reason?: string;
  approved_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface LeaveBalance {
  id: number;
  leave_type: 'CL' | 'SL' | 'EL' | 'WFH' | 'Comp_Off' | 'LWP';
  total: number;
  used: number;
  balance: number;
}

// ===== Tasks =====
export interface Task {
  id: number;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
  deadline?: string;
  assigned_to?: number;
  assigned_to_name?: string;
  assigned_by?: number;
  assigned_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

// ===== Expenses =====
export interface Expense {
  id: number;
  employee_id: number;
  employee_name?: string;
  type: 'advance' | 'expense';
  amount: number;
  expense_date: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected' | 'reimbursed';
  rejection_reason?: string;
  approved_by?: number;
  created_at?: string;
  updated_at?: string;
}

// ===== Helpdesk =====
export interface HelpdeskTicket {
  id: number;
  employee_id: number;
  employee_name?: string;
  category: 'IT' | 'HR' | 'Admin' | 'Facility' | 'Payroll' | 'Other';
  subject: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  resolution?: string;
  created_at?: string;
  updated_at?: string;
}

// ===== Announcements =====
export interface Announcement {
  id: number;
  creator_name?: string;
  title: string;
  content: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  target_scope: 'all' | 'managers' | 'admin';
  target_id?: number;
  created_at?: string;
}

// ===== Filters =====
export interface ClientOption {
  id: number;
  name: string;
}

export interface UnitOption {
  id: number;
  name: string;
  client_id?: number;
}

// ===== Paginated Response =====
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages?: number;
  };
}

// ===== Enum Labels =====
export const LEAVE_TYPES = [
  { value: 'CL', label: 'Casual Leave' },
  { value: 'SL', label: 'Sick Leave' },
  { value: 'EL', label: 'Earned Leave' },
  { value: 'WFH', label: 'Work From Home' },
  { value: 'Comp_Off', label: 'Compensatory Off' },
  { value: 'LWP', label: 'Leave Without Pay' },
] as const;

export const EXPENSE_TYPES = [
  { value: 'advance', label: 'Advance' },
  { value: 'expense', label: 'Expense' },
] as const;

export const HELPDESK_CATEGORIES = [
  { value: 'IT', label: 'IT Support' },
  { value: 'HR', label: 'HR Query' },
  { value: 'Admin', label: 'Administration' },
  { value: 'Facility', label: 'Facility' },
  { value: 'Payroll', label: 'Payroll' },
  { value: 'Other', label: 'Other' },
] as const;

export const TASK_PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const;

export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export const EXPENSE_STATUSES = ['pending', 'approved', 'rejected', 'reimbursed'] as const;
export const HELPDESK_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
