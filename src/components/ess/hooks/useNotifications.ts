import { useState, useEffect, useCallback } from 'react';

// ══════════════════════════════════════════════════════════════
// Notification Types & Local Storage Hook
// ══════════════════════════════════════════════════════════════

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'leave' | 'expense' | 'task' | 'helpdesk' | 'general';
  timestamp: string; // ISO string
  read: boolean;
}

const STORAGE_KEY_PREFIX = 'ess_notifications_';

function getStorageKey(employeeId: number): string {
  return `${STORAGE_KEY_PREFIX}${employeeId}`;
}

function loadFromStorage(employeeId: number): Notification[] {
  try {
    const stored = localStorage.getItem(getStorageKey(employeeId));
    if (stored) {
      return JSON.parse(stored) as Notification[];
    }
  } catch { /* invalid */ }
  return [];
}

function saveToStorage(employeeId: number, notifications: Notification[]) {
  localStorage.setItem(getStorageKey(employeeId), JSON.stringify(notifications));
}

export function useNotifications(employeeId: number) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    if (!employeeId) return;
    setNotifications(loadFromStorage(employeeId));
  }, [employeeId]);

  // Persist whenever notifications change
  useEffect(() => {
    if (!employeeId) return;
    saveToStorage(employeeId, notifications);
  }, [notifications, employeeId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = useCallback(
    (title: string, message: string, type: Notification['type'] = 'general') => {
      const newNotification: Notification = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title,
        message,
        type,
        timestamp: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [newNotification, ...prev]);
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllRead,
    clearAll,
  };
}
