// Employee API service for MySQL backend
import { apiRequest } from './config';

export interface Employee {
  id: number;
  employee_code: number | null;
  mobile_number: string;
  alternate_mobile: string | null;
  full_name: string | null;
  father_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  aadhaar_number: string | null;
  email: string | null;
  uan_number: string | null;
  esic_number: string | null;
  marital_status: string | null;
  blood_group: string | null;
  address: string | null;
  pin_code: string | null;
  state: string | null;
  district: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  account_holder_name: string | null;
  client_name: string | null;
  client_id: number | null;
  unit_name: string | null;
  unit_id: number | null;
  date_of_joining: string | null;
  confirmation_date: string | null;
  probation_period: number | null;
  date_of_leaving: string | null;
  profile_pic_url: string | null;
  profile_pic_cropped_url: string | null;
  aadhaar_front_url: string | null;
  aadhaar_back_url: string | null;
  bank_document_url: string | null;
  status: string | null;
  profile_completion: number | null;
  employee_role: 'admin' | 'manager' | 'employee' | null;
  manager_edits_pending: boolean | null;
  nominee_name: string | null;
  nominee_relationship: string | null;
  nominee_dob: string | null;
  nominee_contact: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  designation: string;
  department: string | null;
  employment_type: 'Permanent' | 'Temporary' | 'Contract' | 'Daily Wages' | null;
  worker_category: 'Skilled' | 'Semi-Skilled' | 'Unskilled' | 'Supervisor' | 'Manager' | 'Other' | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

// Get all employees (paginated)
export async function getEmployees(page: number = 1, limit: number = 100, search?: string, status?: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  return apiRequest<{ data: Employee[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/employees?${params}`);
}

// Get employee by ID
export async function getEmployeeById(id: number | string) {
  return apiRequest<Employee>(`/employees/${id}`);
}

// Get employee by mobile number
export async function getEmployeeByMobile(mobileNumber: string) {
  return apiRequest<Employee>(`/employees/mobile/${mobileNumber}`);
}

// Check if mobile exists
export async function checkMobileExists(mobileNumber: string) {
  return apiRequest<{ exists: boolean }>(`/employees/check-mobile/${mobileNumber}`);
}

// Create new employee
export async function createEmployee(data: Partial<Employee>) {
  return apiRequest<Employee>('/employees', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Update employee
export async function updateEmployee(id: number | string, data: Partial<Employee>) {
  return apiRequest<Employee>(`/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Login employee (mobile + DOB verification)
export async function loginEmployee(mobileNumber: string, dateOfBirth: string) {
  return apiRequest<{ success: boolean; employee?: Employee; error?: string }>('/employees/login', {
    method: 'POST',
    body: JSON.stringify({ mobileNumber, dateOfBirth }),
  });
}

// Approve employee
export async function approveEmployee(id: number, approvedBy: string) {
  return apiRequest<Employee>(`/employees/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approvedBy }),
  });
}

// Reject employee
export async function rejectEmployee(id: number) {
  return apiRequest<Employee>(`/employees/${id}/reject`, {
    method: 'POST',
  });
}

// Update employee role
export async function updateEmployeeRole(id: number, role: 'admin' | 'manager' | 'employee') {
  return apiRequest<Employee>(`/employees/${id}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}
