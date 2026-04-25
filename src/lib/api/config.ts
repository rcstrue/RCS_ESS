// API Configuration - direct calls to backend server
const API_BASE_URL = 'https://join.rcsfacility.com';

// API Key for server-side validation
const API_KEY = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_KEY
  ? process.env.NEXT_PUBLIC_API_KEY
  : '';

// Files base URL for displaying uploaded images
export const FILES_BASE_URL = `${API_BASE_URL}/uploads`;

// Helper to get full file URL from path returned by server
// Server returns paths like "/uploads/profile/xxx.jpg" or "profile/xxx.jpg"
// We need to convert to "https://join.rcsfacility.com/uploads/profile/xxx.jpg"
export function getFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;

  // If already a full URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Remove leading /uploads/ if present (server sometimes returns "/uploads/profile/xxx.jpg")
  const cleanPath = path.replace(/^\/uploads\//, '');

  // Construct full URL: https://join.rcsfacility.com/uploads/profile/xxx.jpg
  return `${FILES_BASE_URL}/${cleanPath}`;
}

// API request helper - direct fetch to backend
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const token = localStorage.getItem('admin_token') || localStorage.getItem('ess_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-KEY': API_KEY,
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const essSession = localStorage.getItem('ess_employee');
    if (essSession) {
      try {
        const parsed = JSON.parse(essSession);
        if (parsed?.employee?.id) {
          headers['X-Employee-ID'] = String(parsed.employee.id);
        }
        // Also store token if the session has one
        if (parsed?.token) {
          headers['Authorization'] = `Bearer ${parsed.token}`;
        }
      } catch { /* invalid session */ }
    }

    const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
      ...options,
      headers,
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    const responseText = await response.text();
    
    let data;
    if (contentType && contentType.includes('application/json')) {
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error('Failed to parse JSON response:', responseText.substring(0, 200));
        return { data: null, error: 'Invalid server response. Please try again.' };
      }
    } else {
      // Response is HTML or something else
      console.error('Non-JSON response received:', responseText.substring(0, 500));
      console.error('Response status:', response.status);
      console.error('Content-Type:', contentType);
      console.error('Endpoint:', endpoint);
      
      if (response.status === 404) {
        return { data: null, error: 'API endpoint not found. Please contact support.' };
      }
      if (response.status === 403) {
        return { data: null, error: 'Access denied. Please check your permissions.' };
      }
      if (response.status === 500) {
        return { data: null, error: 'Server error. Please try again later.' };
      }
      return { data: null, error: 'Server is temporarily unavailable. Please try again.' };
    }

    if (!response.ok) {
      return { data: null, error: data?.error || data?.message || 'Request failed' };
    }

    return { data: data as T, error: null };
  } catch (error) {
    console.error('API Error:', error);
    return { data: null, error: 'Network error. Please check your connection.' };
  }
}

// File upload helper
export async function uploadFile(
  file: File,
  folder: string = 'documents'
): Promise<{ url: string | null; error: string | null }> {
  try {
    const base64Data = await fileToBase64(file);
    return uploadBase64Image(base64Data, file.name, folder);

  } catch (error) {
    console.error('Upload Error:', error);
    return { url: null, error: 'Upload failed. Please try again.' };
  }
}

// Base64 image upload helper (for camera captures)
export async function uploadBase64Image(
  base64Data: string,
  filename: string,
  folder: string = 'documents'
): Promise<{ url: string | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/upload/base64`, {
      method: 'POST',
      headers: (() => {
        const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY };
        const t = localStorage.getItem('admin_token') || localStorage.getItem('ess_token');
        if (t) h['Authorization'] = `Bearer ${t}`;
        const ess = localStorage.getItem('ess_employee');
        if (ess) {
          try {
            const parsed = JSON.parse(ess);
            if (parsed?.employee?.id) h['X-Employee-ID'] = String(parsed.employee.id);
            if (parsed?.token) h['Authorization'] = `Bearer ${parsed.token}`;
          } catch { /* invalid session */ }
        }
        return h;
      })(),
      body: JSON.stringify({ base64Data, filename, folder }),
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    const responseText = await response.text();
    
    let data;
    if (contentType && contentType.includes('application/json')) {
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error('Failed to parse JSON response:', responseText.substring(0, 200));
        return { url: null, error: 'Invalid server response. Please try again.' };
      }
    } else {
      // Response is HTML or something else
      console.error('Non-JSON response from upload:', responseText.substring(0, 500));
      return { url: null, error: 'Server error. Please try again later.' };
    }

    if (!response.ok || data?.error) {
      return { url: null, error: data?.error || 'Upload failed' };
    }

    return { url: data?.url || null, error: null };
  } catch (error) {
    console.error('Upload Error:', error);
    return { url: null, error: 'Upload failed. Please try again.' };
  }
}

// Helper to convert File to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
