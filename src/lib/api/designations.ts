// Designation API service
import { apiRequest } from './config';

export interface Designation {
  id: number;
  name: string;
  desi_view: number;
  created_at: string;
}

// Get all designations
export async function getDesignations() {
  return apiRequest<Designation[]>('/designations');
}

// Get active designations (for registration dropdown)
export async function getActiveDesignations() {
  return apiRequest<Designation[]>('/designations/active');
}

// Create designation
export async function createDesignation(name: string, desiView: number = 1) {
  return apiRequest<Designation>('/designations', {
    method: 'POST',
    body: JSON.stringify({ name, desi_view: desiView }),
  });
}

// Update designation
export async function updateDesignation(id: number, data: { name?: string; desi_view?: number }) {
  return apiRequest<Designation>(`/designations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Delete designation
export async function deleteDesignation(id: number) {
  return apiRequest<{ success: boolean }>(`/designations/${id}`, {
    method: 'DELETE',
  });
}
