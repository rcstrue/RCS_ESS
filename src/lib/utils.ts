import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date from yyyy-mm-dd to dd-mm-yyyy
 * Handles multiple input formats: yyyy-mm-dd, dd-mm-yyyy, ISO strings
 */
export function formatDateDDMMYYYY(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  
  // If already in dd-mm-yyyy format, return as is
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Handle yyyy-mm-dd format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  
  // Handle ISO date string (e.g., 1990-01-15T00:00:00.000Z)
  if (dateStr.includes('T')) {
    const datePart = dateStr.split('T')[0];
    const parts = datePart.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  
  // Return original if format not recognized
  return dateStr;
}

/**
 * Convert dd-mm-yyyy to yyyy-mm-dd for input[type="date"]
 */
export function formatDateForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  
  // If already in yyyy-mm-dd format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Handle dd-mm-yyyy format
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const parts = dateStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  
  // Handle ISO date string
  if (dateStr.includes('T')) {
    return dateStr.split('T')[0];
  }
  
  return dateStr;
}

export function scrollToError(fieldName: string, container?: HTMLElement | null) {
  setTimeout(() => {
    const el = container?.querySelector(`[data-field="${fieldName}"]`) || 
               container?.querySelector(`[data-error="${fieldName}"]`) ||
               document.querySelector(`[data-field="${fieldName}"]`) ||
               document.querySelector(`[data-error="${fieldName}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Vibrate if supported
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }
  }, 50);
}
