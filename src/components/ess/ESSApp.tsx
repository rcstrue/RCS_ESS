'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { essLogin, fetchProfile, fetchLeaveBalance, fetchLeaves, fetchExpenses, fetchTasks, changePin } from '@/lib/ess-api';
import type { Employee, EmployeeRole, ESSSession, LeaveBalance, AttendanceRecord } from '@/lib/ess-types';
import { getFileUrl } from '@/lib/api/config';

// Module pages
import AttendancePage from './AttendancePage';
import LeavesPage from './LeavesPage';
import { ExpensesPage } from './ExpensesPage';
import { TasksPage } from './TasksPage';
import HelpdeskPage from './HelpdeskPage';
import AnnouncementsPage from './AnnouncementsPage';
import DirectoryPage from './DirectoryPage';

// shadcn/ui
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

// lucide icons
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
  LogOut,
  LogIn,
  ChevronRight,
  MapPin,
  Building2,
  Phone,
  Mail,
  Shield,
  Bell,
  UserCircle,
  Loader2,
  AlertTriangle,
  Leaf,
  CheckCircle2,
  ListTodo,
  KeyRound,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface ESSAppProps {
  onBackToRegistration: () => void;
}

interface DashboardData {
  leaveBalance: LeaveBalance[];
  clBalance: number;
  todayAttendance: AttendanceRecord | null;
  pendingLeaves: number;
  pendingExpenses: number;
  pendingTasks: number;
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function detectRole(employee: Employee): EmployeeRole {
  const category = (employee.worker_category || '').toLowerCase();
  const role = (employee.employee_role || '').toLowerCase();
  if (category.includes('regional') || role.includes('regional')) return 'regional_manager';
  if (category.includes('manager') || role.includes('manager')) return 'manager';
  if (category.includes('supervisor') || role.includes('supervisor') || category.includes('team lead')) return 'supervisor';
  return 'employee';
}

function canApprove(role: EmployeeRole): boolean {
  return role !== 'employee';
}

function getScope(role: EmployeeRole): string {
  switch (role) {
    case 'regional_manager': return 'all';
    case 'manager': return 'city';
    case 'supervisor': return 'unit';
    default: return 'self';
  }
}

function getRoleBadge(role: EmployeeRole): { label: string; className: string } {
  switch (role) {
    case 'regional_manager': return { label: 'Regional Manager', className: 'bg-purple-100 text-purple-700 border-purple-200' };
    case 'manager': return { label: 'Manager', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'supervisor': return { label: 'Supervisor', className: 'bg-teal-100 text-teal-700 border-teal-200' };
    default: return { label: 'Employee', className: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { key: 'directory', label: 'Employees', icon: Users },
  { key: 'expenses', label: 'Expenses', icon: Receipt },
  { key: '_more', label: 'More', icon: MoreHorizontal },
] as const;

const MORE_MENU_ITEMS = [
  { key: 'attendance', label: 'Attendance', icon: Clock, description: 'Check in/out & view history' },
  { key: 'leaves', label: 'Leave', icon: CalendarDays, description: 'Apply & track leave requests' },
  { key: 'tasks', label: 'Tasks', icon: ClipboardList, description: 'Manage your task assignments' },
  { key: 'announcements', label: 'Notices', icon: Megaphone, description: 'Company announcements & updates' },
  { key: 'helpdesk', label: 'Help Desk', icon: CircleHelp, description: 'Submit support tickets' },
  { key: 'profile', label: 'My Profile', icon: UserCircle, description: 'View your profile details' },
  { key: 'settings', label: 'Settings', icon: Settings, description: 'App preferences' },
] as const;

// ══════════════════════════════════════════════════════════════
// LoginScreen Component
// ══════════════════════════════════════════════════════════════

function LoginScreen({ onLogin, onBackToRegistration }: {
  onLogin: (session: ESSSession) => void;
  onBackToRegistration: () => void;
}) {
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first pin box
  useEffect(() => {
    if (showPin) {
      pinRefs.current[0]?.focus();
    }
  }, [showPin]);

  const handleContinue = () => {
    const cleaned = mobile.replace(/\D/g, '');
    if (cleaned.length !== 10) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }
    setShowPin(true);
  };

  const handlePinChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').slice(0, 4);
      const newPin = [...pin];
      digits.split('').forEach((d, i) => {
        if (index + i < 4) newPin[index + i] = d;
      });
      setPin(newPin);
      const nextEmpty = newPin.findIndex((p, i) => i > index && p === '');
      if (nextEmpty !== -1) pinRefs.current[nextEmpty]?.focus();
      else pinRefs.current[3]?.focus();
      return;
    }

    if (!/^\d*$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    if (value && index < 3) {
      pinRefs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
      const newPin = [...pin];
      newPin[index - 1] = '';
      setPin(newPin);
    }
  };

  const handleLogin = async () => {
    const fullPin = pin.join('');
    if (fullPin.length !== 4) {
      toast.error('Please enter your 4-digit PIN');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await essLogin(mobile.replace(/\D/g, ''), fullPin);
      if (error) {
        toast.error(error);
        return;
      }
      if (!data) {
        toast.error('Login failed. Please try again.');
        return;
      }

      const role = detectRole(data.employee);
      const session: ESSSession = { employee: data.employee, role };
      onLogin(session);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    setPin(['', '', '', '']);
    setShowPin(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top gradient bar */}
      <div className="h-2 bg-emerald-600" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-200 mb-4">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">RCS Facility</h1>
          <p className="text-sm text-gray-500 mt-1">Employee Self-Service</p>
        </div>

        {!showPin ? (
          /* ── Mobile Step ── */
          <div className="w-full max-w-sm space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Welcome back</h2>
                <p className="text-sm text-gray-500 mt-1">Enter your registered mobile number to continue</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Mobile Number</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 h-11 bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-600 font-medium shrink-0">
                    <span>+91</span>
                  </div>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder="Enter 10-digit number"
                    maxLength={10}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="flex-1 h-11"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleContinue();
                    }}
                  />
                </div>
              </div>

              <Button
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                onClick={handleContinue}
                disabled={mobile.replace(/\D/g, '').length !== 10}
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            <Button
              variant="ghost"
              className="text-sm text-gray-500 hover:text-gray-700"
              onClick={onBackToRegistration}
            >
              New employee? Register here
            </Button>
          </div>
        ) : (
          /* ── PIN Step ── */
          <div className="w-full max-w-sm space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Enter your PIN</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Verify with the number ending <span className="font-semibold text-gray-700">******{mobile.slice(-4)}</span>
                </p>
              </div>

              {/* PIN Input */}
              <div className="flex items-center justify-center gap-3 py-2">
                {pin.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { pinRefs.current[i] = el; }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    value={digit}
                    onChange={(e) => handlePinChange(i, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(i, e)}
                    onFocus={(e) => e.target.select()}
                    className={`
                      w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all
                      focus:outline-none focus:ring-0
                      ${digit
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-white text-gray-900 focus:border-emerald-500'
                      }
                    `}
                  />
                ))}
              </div>

              <Button
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                onClick={handleLogin}
                disabled={pin.join('').length !== 4 || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Login
                  </>
                )}
              </Button>

              <button
                onClick={handleResend}
                className="w-full text-center text-sm text-gray-500 hover:text-emerald-600 transition-colors"
              >
                Use a different number
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-4 text-xs text-gray-400">
        RCS Facility Services Pvt. Ltd.
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// DashboardHome Component
// ══════════════════════════════════════════════════════════════

function DashboardHome({
  employee,
  role,
  dashboardData,
  loading,
  onNavigate,
}: {
  employee: Employee;
  role: EmployeeRole;
  dashboardData: DashboardData | null;
  loading: boolean;
  onNavigate: (page: string) => void;
}) {
  const hasApprovals = canApprove(role) && dashboardData
    && (dashboardData.pendingLeaves + dashboardData.pendingExpenses) > 0;

  const quickActions = [
    { key: 'attendance', label: 'Attendance', icon: Clock, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { key: 'leaves', label: 'Leave', icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50' },
    { key: 'tasks', label: 'Tasks', icon: ClipboardList, color: 'text-violet-600', bg: 'bg-violet-50' },
    { key: 'expenses', label: 'Expenses', icon: Receipt, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'announcements', label: 'Notices', icon: Megaphone, color: 'text-rose-600', bg: 'bg-rose-50' },
    { key: 'helpdesk', label: 'Help Desk', icon: CircleHelp, color: 'text-sky-600', bg: 'bg-sky-50' },
  ];

  return (
    <div className="space-y-5">
      {/* Pending Approvals Alert */}
      {hasApprovals && (
        <button
          onClick={() => onNavigate('leaves')}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-left transition-colors hover:bg-amber-100"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {dashboardData!.pendingLeaves + dashboardData!.pendingExpenses} Pending Approvals
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {dashboardData!.pendingLeaves} leave request{dashboardData!.pendingLeaves !== 1 ? 's' : ''} &middot; {dashboardData!.pendingExpenses} expense claim{dashboardData!.pendingExpenses !== 1 ? 's' : ''}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
        </button>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Leave Balance */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-12" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 mb-1">
                  <Leaf className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs text-gray-500">Leave Balance</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {dashboardData?.clBalance ?? 0}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">CL remaining</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        {canApprove(role) && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-12" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs text-gray-500">Approvals</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {(dashboardData?.pendingLeaves ?? 0) + (dashboardData?.pendingExpenses ?? 0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Pending action</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Today's Attendance */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-20" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 mb-1">
                  <LogIn className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs text-gray-500">Today</span>
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {dashboardData?.todayAttendance
                    ? dashboardData.todayAttendance.status === 'checked_in'
                      ? 'Checked In'
                      : dashboardData.todayAttendance.status === 'checked_out'
                        ? 'Checked Out'
                        : dashboardData.todayAttendance.status === 'present'
                          ? 'Present'
                          : 'Not marked'
                    : 'Not marked'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Attendance</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pending Tasks */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-12" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 mb-1">
                  <ListTodo className="w-3.5 h-3.5 text-violet-500" />
                  <span className="text-xs text-gray-500">Tasks</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {dashboardData?.pendingTasks ?? 0}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Pending</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
          Quick Actions
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.key}
              onClick={() => onNavigate(action.key)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border shadow-sm hover:shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${action.bg}`}>
                <action.icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <span className="text-xs font-medium text-gray-700">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ProfileView Component
// ══════════════════════════════════════════════════════════════

function ProfileView({
  employee,
  role,
  onNavigate,
}: {
  employee: Employee;
  role: EmployeeRole;
  onNavigate: (page: string) => void;
}) {
  const roleBadge = getRoleBadge(role);
  const initials = getInitials(employee.full_name || 'U');

  const profileFields: { icon: React.ElementType; label: string; value: string }[] = [
    { icon: Shield, label: 'Employee Code', value: employee.employee_code || `EMP-${employee.id}` },
    { icon: UserCircle, label: 'Designation', value: employee.designation || '—' },
    { icon: Building2, label: 'Department', value: employee.department || '—' },
    { icon: Building2, label: 'Client / Unit', value: [employee.client_name, employee.unit_name].filter(Boolean).join(' / ') || '—' },
    { icon: Mail, label: 'Email', value: employee.email || '—' },
    { icon: Phone, label: 'Mobile', value: employee.mobile_number ? `+91 ${employee.mobile_number}` : '—' },
    { icon: MapPin, label: 'City', value: employee.city || '—' },
    { icon: CalendarDays, label: 'Date of Joining', value: employee.date_of_joining ? formatDate(employee.date_of_joining) : '—' },
    { icon: Shield, label: 'Role', value: roleBadge.label },
  ];

  return (
    <div className="space-y-5">
      {/* Profile Card */}
      <Card className="border-0 shadow-sm overflow-hidden">
        {/* Header with gradient */}
        <div className="h-24 bg-gradient-to-r from-emerald-600 to-emerald-500" />
        <CardContent className="p-5 -mt-10">
          <div className="flex items-end gap-4">
            <Avatar className="w-20 h-20 border-4 border-white shadow-md">
              <AvatarImage src={getFileUrl(employee.profile_pic_url) || undefined} alt={employee.full_name} />
              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="pb-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">{employee.full_name}</h2>
              <p className="text-sm text-gray-500">{employee.designation || 'Employee'}</p>
              <Badge variant="outline" className={`mt-1 text-xs ${roleBadge.className}`}>
                {roleBadge.label}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Details */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="space-y-1">
            {profileFields.map((field) => (
              <div key={field.label} className="flex items-start gap-3 py-2.5">
                <field.icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">{field.label}</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{field.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="w-full" onClick={() => onNavigate('settings')}>
          <Settings className="w-4 h-4" />
          Settings
        </Button>
        <Button variant="outline" className="w-full" onClick={() => onNavigate('leaves')}>
          <Leaf className="w-4 h-4" />
          Leave Balance
        </Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SettingsView Component
// ══════════════════════════════════════════════════════════════

function SettingsView({
  employee,
  onLogout,
  onShowPinDialog,
}: {
  employee: Employee;
  onLogout: () => void;
  onShowPinDialog: () => void;
}) {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setDarkMode(isDark);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.classList.toggle('dark', newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500">Manage your app preferences</p>
      </div>

      {/* Dark Mode */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100">
                <Shield className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Dark Mode</p>
                <p className="text-xs text-gray-400">Switch between light and dark theme</p>
              </div>
            </div>
            <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
          </div>
        </CardContent>
      </Card>

      {/* Change PIN */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50">
                <KeyRound className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Change PIN</p>
                <p className="text-xs text-gray-400">Update your login PIN</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onShowPinDialog}>
              Change
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50">
              <Building2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">About</p>
              <p className="text-xs text-gray-400">App information & version</p>
            </div>
          </div>
          <Separator />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">App Name</span>
              <span className="text-gray-800 font-medium">RCS Employee Self-Service</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Version</span>
              <span className="text-gray-800 font-medium">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Employee</span>
              <span className="text-gray-800 font-medium">{employee.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Employee Code</span>
              <span className="text-gray-800 font-medium">{employee.employee_code || `EMP-${employee.id}`}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logout */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <Button
            variant="destructive"
            className="w-full"
            onClick={onLogout}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
          <p className="text-xs text-gray-400 text-center mt-2">
            You will need to login again to access the app
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Page Header Component
// ══════════════════════════════════════════════════════════════

function PageHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-white border shadow-sm hover:bg-gray-50 shrink-0 mt-0.5"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
      )}
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PinInputBoxes Helper
// ══════════════════════════════════════════════════════════════

function PinInputBoxes({
  step, currentPin, newPin, confirmPin, setCurrentPin, setNewPin, setConfirmPin,
}: {
  step: 'current' | 'new' | 'confirm';
  currentPin: string;
  newPin: string;
  confirmPin: string;
  setCurrentPin: (v: string) => void;
  setNewPin: (v: string) => void;
  setConfirmPin: (v: string) => void;
}) {
  const pin = step === 'current' ? currentPin : step === 'new' ? newPin : confirmPin;
  const setPin = step === 'current' ? setCurrentPin : step === 'new' ? setNewPin : setConfirmPin;

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 4 - index);
      setPin(pin.slice(0, index) + digits);
      return;
    }
    if (!/^\d*$/.test(value)) return;
    setPin(pin.slice(0, index) + value + pin.slice(index + 1));
  };

  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <input
          key={`${step}-${i}`}
          type="tel"
          inputMode="numeric"
          maxLength={4}
          value={pin[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onFocus={(e) => e.target.select()}
          className="w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-700 focus:outline-none"
        />
      ))}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// ChangePinDialog Component
// ══════════════════════════════════════════════════════════════

function ChangePinDialog({
  open,
  onOpenChange,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | number;
}) {
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const resetAndClose = () => {
    setStep('current');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setLoading(false);
    onOpenChange(false);
  };

  const handleSubmitCurrentPin = async () => {
    if (currentPin.length !== 4) {
      toast.error('Please enter your current 4-digit PIN');
      return;
    }
    // Move to new PIN step
    setStep('new');
  };

  const handleSubmitNewPin = () => {
    if (newPin.length !== 4) {
      toast.error('Please enter a 4-digit new PIN');
      return;
    }
    setStep('confirm');
  };

  const handleSubmitConfirmPin = async () => {
    if (confirmPin !== newPin) {
      toast.error('PINs do not match. Please try again.');
      setConfirmPin('');
      setStep('new');
      return;
    }

    setLoading(true);
    try {
      const { error } = await changePin(employeeId, currentPin, newPin);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('PIN changed successfully!');
      resetAndClose();
    } catch {
      toast.error('Failed to change PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'confirm') { setStep('new'); setConfirmPin(''); }
    else if (step === 'new') { setStep('current'); setNewPin(''); }
  };

  const stepTitles = {
    current: 'Enter Current PIN',
    new: 'Enter New PIN',
    confirm: 'Confirm New PIN',
  };
  const stepIcons = { current: Shield, new: KeyRound, confirm: CheckCircle2 };
  const StepIcon = stepIcons[step];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StepIcon className="w-5 h-5 text-emerald-600" />
            {stepTitles[step]}
          </DialogTitle>
          <DialogDescription>
            {step === 'current' && 'Verify your current PIN first'}
            {step === 'new' && 'Choose a new 4-digit PIN'}
            {step === 'confirm' && 'Re-enter your new PIN to confirm'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-3 py-4">
          <PinInputBoxes
            step={step}
            currentPin={currentPin}
            newPin={newPin}
            confirmPin={confirmPin}
            setCurrentPin={setCurrentPin}
            setNewPin={setNewPin}
            setConfirmPin={setConfirmPin}
          />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-2">
          {(['current', 'new', 'confirm'] as const).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step ? 'w-8 bg-emerald-500' :
                ['current', 'new', 'confirm'].indexOf(s) < ['current', 'new', 'confirm'].indexOf(step)
                  ? 'w-8 bg-emerald-300'
                  : 'w-8 bg-gray-200'
              }`}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {step !== 'current' && (
            <Button variant="outline" onClick={handleBack} disabled={loading}>
              Back
            </Button>
          )}
          <Button
            onClick={
              step === 'current' ? handleSubmitCurrentPin :
              step === 'new' ? handleSubmitNewPin :
              handleSubmitConfirmPin
            }
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
            ) : step === 'confirm' ? (
              'Change PIN'
            ) : (
              'Next'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════
// Main ESSApp Component
// ══════════════════════════════════════════════════════════════

export default function ESSApp({ onBackToRegistration }: ESSAppProps) {
  // ── Auth State ──
  const [session, setSession] = useState<ESSSession | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Navigation State ──
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const [showPinDialog, setShowPinDialog] = useState(false);

  // ── Dashboard Data ──
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  // ── Session Management ──
  const loadSession = useCallback(() => {
    try {
      const stored = localStorage.getItem('ess_employee');
      if (stored) {
        const parsed = JSON.parse(stored) as ESSSession;
        if (parsed?.employee?.id) {
          setSession(parsed);
          return;
        }
      }
    } catch {
      // Invalid stored session
    }
    localStorage.removeItem('ess_employee');
  }, []);

  useEffect(() => {
    loadSession();
    setLoading(false);
  }, [loadSession]);

  const saveSession = useCallback((sess: ESSSession) => {
    localStorage.setItem('ess_employee', JSON.stringify(sess));
    setSession(sess);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem('ess_employee');
    setSession(null);
    setCurrentPage('dashboard');
    setDashboardData(null);
    toast.success('Logged out successfully');
  }, []);

  const handleLogin = useCallback((sess: ESSSession) => {
    saveSession(sess);
    toast.success(`Welcome, ${sess.employee.full_name}!`);
  }, [saveSession]);

  // ── Load Dashboard Data ──
  const loadDashboardData = useCallback(async () => {
    if (!session) return;
    setDashboardLoading(true);

    try {
      const empId = session.employee.id;

      const [profileRes, balanceRes, leavesRes, expensesRes, tasksRes] = await Promise.allSettled([
        fetchProfile(empId),
        fetchLeaveBalance(empId),
        fetchLeaves(empId, 'pending'),
        fetchExpenses(empId, 'pending'),
        fetchTasks({ assigned_to: empId, status: 'pending' }),
      ]);

      // Extract data from settled results
      const profileData = profileRes.status === 'fulfilled' ? profileRes.value?.data : null;
      const balanceData = balanceRes.status === 'fulfilled' ? balanceRes.value?.data : null;
      const leavesData = leavesRes.status === 'fulfilled' ? leavesRes.value?.data : null;
      const expensesData = expensesRes.status === 'fulfilled' ? expensesRes.value?.data : null;
      const tasksData = tasksRes.status === 'fulfilled' ? tasksRes.value?.data : null;

      // Find today's attendance from profile
      let todayAttendance: AttendanceRecord | null = null;
      const todayStr = todayDateString();
      if (profileData?.recent_attendance) {
        todayAttendance = profileData.recent_attendance.find(
          (r: AttendanceRecord) => r.date === todayStr
        ) ?? null;
      }

      // CL balance
      const balances = Array.isArray(balanceData) ? balanceData : [];
      const clBalance = balances.find((b: LeaveBalance) => b.leave_type === 'CL')?.balance ?? 0;

      setDashboardData({
        leaveBalance: balances,
        clBalance,
        todayAttendance,
        pendingLeaves: leavesData?.pagination?.total ?? leavesData?.items?.length ?? 0,
        pendingExpenses: expensesData?.pagination?.total ?? expensesData?.items?.length ?? 0,
        pendingTasks: tasksData?.pagination?.total ?? tasksData?.items?.length ?? 0,
      });
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setDashboardLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      loadDashboardData();
    }
  }, [session, loadDashboardData]);

  // Refresh dashboard when navigating back to it
  useEffect(() => {
    if (currentPage === 'dashboard' && session) {
      loadDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // ── Navigation ──
  const navigate = useCallback((page: string) => {
    if (page === 'logout') {
      clearSession();
      return;
    }
    setCurrentPage(page);
    setShowMoreMenu(false);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [clearSession]);

  const activeNavKey = ['dashboard', 'directory', 'expenses', '_more'].includes(currentPage)
    ? currentPage
    : '_more';

  // ── Loading State ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Login Screen ──
  if (!session) {
    return <LoginScreen onLogin={handleLogin} onBackToRegistration={onBackToRegistration} />;
  }

  // ── Derived Values ──
  const emp = session.employee;
  const role = session.role;
  const scope = getScope(role);
  const initials = getInitials(emp.full_name || 'U');
  const isApprover = canApprove(role);
  const canPostAnnouncement = role !== 'employee';

  // ════════════════════════════════════════════════════════════
  // Render Logged-In App
  // ════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── App Header ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b">
        <div className="flex items-center gap-3 px-4 h-14">
          {/* Avatar */}
          <Avatar className="w-9 h-9 border border-emerald-200">
            <AvatarImage src={getFileUrl(emp.profile_pic_url) || undefined} alt={emp.full_name} />
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Name + Designation */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{emp.full_name}</p>
            <p className="text-xs text-gray-500 truncate">{emp.designation || emp.employee_role || 'Employee'}</p>
          </div>

          {/* Announcement Bell */}
          <button
            onClick={() => { setAnnouncementCount(0); navigate('announcements'); }}
            className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-4.5 h-4.5 text-gray-600" />
            {announcementCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4.5 h-4.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                {announcementCount > 9 ? '9+' : announcementCount}
              </span>
            )}
          </button>

          {/* Company Logo */}
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-600">
            <Building2 className="w-4 h-4 text-white" />
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="px-4 py-4 pb-24">
        {currentPage === 'dashboard' && (
          <div className="space-y-5">
            {/* Welcome Banner */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {getGreeting()}, {emp.full_name?.split(' ')[0]} 👋
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {new Date().toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
            <DashboardHome
              employee={emp}
              role={role}
              dashboardData={dashboardData}
              loading={dashboardLoading}
              onNavigate={navigate}
            />
          </div>
        )}

        {currentPage === 'directory' && (
          <>
            <PageHeader title="Employees" subtitle="Search & browse the employee directory" />
            <DirectoryPage
              employeeId={emp.id}
              role={role}
              scope={scope}
            />
          </>
        )}

        {currentPage === 'expenses' && (
          <>
            <PageHeader title="Expenses" subtitle="Submit & track expense claims" />
            <ExpensesPage
              employeeId={emp.id}
              employeeName={emp.full_name || 'Employee'}
              role={role}
              canApprove={isApprover}
            />
          </>
        )}

        {currentPage === 'attendance' && (
          <>
            <PageHeader title="Attendance" subtitle="Mark & view your attendance" onBack={() => navigate('dashboard')} />
            <AttendancePage
              employeeId={emp.id}
              employeeName={emp.full_name || 'Employee'}
              role={role}
            />
          </>
        )}

        {currentPage === 'leaves' && (
          <>
            <PageHeader title="Leave" subtitle="Apply & track leave requests" onBack={() => navigate('dashboard')} />
            <LeavesPage
              employeeId={emp.id}
              employeeName={emp.full_name || 'Employee'}
              role={role}
              canApprove={isApprover}
            />
          </>
        )}

        {currentPage === 'tasks' && (
          <>
            <PageHeader title="Tasks" subtitle="Manage your task assignments" onBack={() => navigate('dashboard')} />
            <TasksPage
              employeeId={emp.id}
              employeeName={emp.full_name || 'Employee'}
              role={role}
              canApprove={isApprover}
            />
          </>
        )}

        {currentPage === 'announcements' && (
          <>
            <PageHeader title="Notices" subtitle="Company announcements & updates" onBack={() => navigate('dashboard')} />
            <AnnouncementsPage
              employeeId={emp.id}
              role={role}
              canPost={canPostAnnouncement}
            />
          </>
        )}

        {currentPage === 'helpdesk' && (
          <>
            <PageHeader title="Help Desk" subtitle="Submit & track support tickets" onBack={() => navigate('dashboard')} />
            <HelpdeskPage
              employeeId={emp.id}
              employeeName={emp.full_name || 'Employee'}
            />
          </>
        )}

        {currentPage === 'profile' && (
          <ProfileView
            employee={emp}
            role={role}
            onNavigate={navigate}
          />
        )}

        {currentPage === 'settings' && (
          <SettingsView
            employee={emp}
            onLogout={clearSession}
            onShowPinDialog={() => setShowPinDialog(true)}
          />
        )}
      </main>

      {/* ── Change PIN Dialog ── */}
      <ChangePinDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        employeeId={emp.id}
      />

      {/* ── Bottom Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t safe-area-bottom">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.key === '_more'
                ? !['dashboard', 'directory', 'expenses'].includes(currentPage)
                : item.key === currentPage;

            const isMore = item.key === '_more';

            if (isMore) {
              return (
                <Sheet key={item.key} open={showMoreMenu} onOpenChange={setShowMoreMenu}>
                  <button
                    onClick={() => setShowMoreMenu(true)}
                    className={`
                      flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors
                      ${isActive ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500 hover:text-gray-700'}
                    `}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </button>

                  <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
                    <SheetHeader className="pb-2">
                      <SheetTitle className="text-center">More Options</SheetTitle>
                    </SheetHeader>

                    <div className="space-y-1 px-2 pb-4">
                      {MORE_MENU_ITEMS.map((menuItem) => (
                        <button
                          key={menuItem.key}
                          onClick={() => navigate(menuItem.key)}
                          className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 shrink-0">
                            <menuItem.icon className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{menuItem.label}</p>
                            <p className="text-xs text-gray-400">{menuItem.description}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                        </button>
                      ))}

                      <Separator className="my-2" />

                      {/* Logout */}
                      <button
                        onClick={() => navigate('logout')}
                        className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-rose-50 transition-colors text-left"
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-rose-100 shrink-0">
                          <LogOut className="w-5 h-5 text-rose-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-rose-700">Logout</p>
                          <p className="text-xs text-rose-400">Sign out of your account</p>
                        </div>
                      </button>
                    </div>
                  </SheetContent>
                </Sheet>
              );
            }

            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                className={`
                  flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors
                  ${isActive ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500 hover:text-gray-700'}
                `}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Safe area spacer for notched devices */}
        <div className="h-[env(safe-area-inset-bottom,0px)] bg-white" />
      </nav>
    </div>
  );
}
