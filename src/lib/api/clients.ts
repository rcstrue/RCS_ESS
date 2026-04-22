// Clients & Units API service for MySQL backend
import { apiRequest } from './config';

export interface Unit {
  id: number;
  name: string;
  client_id: number;
  unit_code?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  contact_person?: string;
  contact_phone?: string;
  is_active?: number;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;
  client_code?: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gst_number?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  is_active?: number;
  units: Unit[];
  created_at: string;
  updated_at: string;
}

// Get all clients with units
export async function getClients() {
  return apiRequest<Client[]>('/clients');
}

// Get all clients with their units (for dropdowns)
export async function getClientsWithUnits() {
  return apiRequest<Client[]>('/clients');
}

// Get client by ID
export async function getClientById(id: number) {
  return apiRequest<Client>(`/clients/${id}`);
}

// Create new client
export async function createClient(name: string) {
  return apiRequest<Client>('/clients', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// Delete client
export async function deleteClient(id: number) {
  return apiRequest<{ success: boolean }>(`/clients/${id}`, {
    method: 'DELETE',
  });
}

// Get all units
export async function getUnits() {
  return apiRequest<Unit[]>('/units');
}

// Create new unit
export async function createUnit(clientId: number, name: string) {
  return apiRequest<Unit>('/units', {
    method: 'POST',
    body: JSON.stringify({ clientId, name }),
  });
}

// Delete unit
export async function deleteUnit(id: number) {
  return apiRequest<{ success: boolean }>(`/units/${id}`, {
    method: 'DELETE',
  });
}
