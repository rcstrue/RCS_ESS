// ══════════════════════════════════════════════════════════════
// ESS Constants — Navigation items, menu items, config
// ══════════════════════════════════════════════════════════════

import {
  LayoutDashboard,
  Users,
  Receipt,
  MoreHorizontal,
  Clock,
  CalendarDays,
  ClipboardList,
  Megaphone,
  CircleHelp,
  Settings,
  UserCircle,
  UserPlus,
  Download,
  Bell,
  PartyPopper,
  FileEdit,
} from 'lucide-react';

export const APP_VERSION = '2.0.0';

export const NAV_ITEMS = [
  { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { key: 'directory', label: 'Employees', icon: Users },
  { key: 'expenses', label: 'Expenses', icon: Receipt },
  { key: '_more', label: 'More', icon: MoreHorizontal },
] as const;

export const MORE_MENU_ITEMS = [
  { key: 'attendance', label: 'Attendance', icon: Clock, description: 'View attendance history' },
  { key: 'leaves', label: 'Leave', icon: CalendarDays, description: 'Apply & track leave requests' },
  { key: 'tasks', label: 'Tasks', icon: ClipboardList, description: 'Manage your task assignments' },
  { key: 'announcements', label: 'Notices', icon: Megaphone, description: 'Company announcements & updates' },
  { key: 'helpdesk', label: 'Help Desk', icon: CircleHelp, description: 'Submit support tickets' },
  { key: 'regularization', label: 'Regularization', icon: FileEdit, description: 'Regularize missed check-ins' },
  { key: 'holidays', label: 'Holidays', icon: PartyPopper, description: 'Company holiday calendar' },
  { key: 'notifications', label: 'Notifications', icon: Bell, description: 'View your notifications' },
  { key: 'profile', label: 'My Profile', icon: UserCircle, description: 'View your profile details' },
  { key: 'settings', label: 'Settings', icon: Settings, description: 'App preferences' },
  { key: 'new-registration', label: 'New Registration', icon: UserPlus, description: 'Register a new employee' },
  { key: 'install-app', label: 'Install App', icon: Download, description: 'Add to home screen for quick access' },
] as const;
