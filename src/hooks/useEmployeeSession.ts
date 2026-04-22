import { useState, useEffect, useCallback } from 'react';
import { 
  getEmployeeById, 
  getEmployeeByMobile, 
  checkMobileExists as apiCheckMobileExists,
  loginEmployee,
  Employee as APIEmployee 
} from '@/lib/api/employees';

export interface Employee {
  id: string;
  mobile_number: string;
  date_of_birth: string | null;
  full_name: string | null;
  father_name: string | null;
  gender: string | null;
  aadhaar_number: string | null;
  email: string | null;
  uan_number: string | null;
  esic_number: string | null;
  marital_status: string | null;
  address: string | null;
  pin_code: string | null;
  state: string | null;
  district: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  account_holder_name: string | null;
  client_name: string | null;
  client_id: string | null;
  unit_name: string | null;
  unit_id: string | null;
  profile_pic_url: string | null;
  aadhaar_front_url: string | null;
  aadhaar_back_url: string | null;
  bank_document_url: string | null;
  status: string | null;
  profile_completion: number | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  designation: string | null;
  date_of_joining: string | null;
  employee_code: number | null;
  created_at: string;
  updated_at: string;
}

interface UseEmployeeSessionReturn {
  employee: Employee | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (mobileNumber: string, dateOfBirth: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  checkMobileExists: (mobileNumber: string) => Promise<boolean>;
  refreshEmployee: () => Promise<void>;
}

// Required fields for profile completion
const REQUIRED_FIELDS = [
  'mobile_number',
  'date_of_birth',
  'full_name',
  'gender',
  'aadhaar_number',
  'address',
  'pin_code',
  'state',
  'district',
  'bank_name',
  'account_number',
  'ifsc_code',
  'account_holder_name',
  'client_name',
  'unit_name',
  'profile_pic_url',
  'aadhaar_front_url',
  'aadhaar_back_url',
  'bank_document_url',
] as const;

export function calculateProfileCompletion(employee: Employee | null): number {
  if (!employee) return 0;
  
  let filledFields = 0;
  for (const field of REQUIRED_FIELDS) {
    const value = employee[field];
    if (value !== null && value !== '' && value !== undefined) {
      filledFields++;
    }
  }
  
  return Math.round((filledFields / REQUIRED_FIELDS.length) * 100);
}

export function getMissingFields(employee: Employee | null): string[] {
  if (!employee) return [...REQUIRED_FIELDS];
  
  const missing: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const value = employee[field];
    if (value === null || value === '' || value === undefined) {
      missing.push(field);
    }
  }
  
  return missing;
}

export function useEmployeeSession(): UseEmployeeSessionReturn {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const storedEmployeeId = localStorage.getItem('employee_id');
    if (storedEmployeeId) {
      fetchEmployee(storedEmployeeId);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchEmployee = async (employeeId: string) => {
    try {
      const { data, error } = await getEmployeeById(employeeId);

      if (error) throw new Error(error);
      
      if (data) {
        setEmployee(data as Employee);
      } else {
        localStorage.removeItem('employee_id');
      }
    } catch (error) {
      console.error('Error fetching employee:', error);
      localStorage.removeItem('employee_id');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshEmployee = useCallback(async () => {
    if (employee?.id) {
      await fetchEmployee(employee.id);
    }
  }, [employee?.id]);

  const checkMobileExists = useCallback(async (mobileNumber: string): Promise<boolean> => {
    try {
      const { data, error } = await apiCheckMobileExists(mobileNumber);

      if (error) throw new Error(error);
      return data?.exists || false;
    } catch (error) {
      console.error('Error checking mobile:', error);
      return false;
    }
  }, []);

  const login = useCallback(async (mobileNumber: string, dateOfBirth: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await loginEmployee(mobileNumber, dateOfBirth);

      if (error) throw new Error(error);

      if (!data?.success || !data?.employee) {
        return { success: false, error: data?.error || 'Login failed' };
      }

      // Store session
      localStorage.setItem('employee_id', data.employee.id);
      
      // Fetch complete employee data with JOINs (client_name, unit_name) using getEmployeeById
      // The login endpoint returns raw employee data without JOINs
      const { data: fullEmployeeData } = await getEmployeeById(data.employee.id);
      
      if (fullEmployeeData) {
        setEmployee(fullEmployeeData as Employee);
      } else {
        setEmployee(data.employee as Employee);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An error occurred during login' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('employee_id');
    setEmployee(null);
  }, []);

  return {
    employee,
    isLoading,
    isLoggedIn: employee !== null,
    login,
    logout,
    checkMobileExists,
    refreshEmployee,
  };
}
