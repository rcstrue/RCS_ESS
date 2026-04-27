'use client';

import { useState, useEffect } from 'react';
import { canApprove, parseIST } from './helpers';
import type { Employee, EmployeeRole, LeaveBalance, AttendanceRecord } from '@/lib/ess-types';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LogIn,
  LogOut,
  Clock,
  CalendarDays,
  ClipboardList,
  Receipt,
  Megaphone,
  CircleHelp,
  Bell,
  ChevronRight,
  Leaf,
  CheckCircle2,
  ListTodo,
  Timer,
  MapPin,
  Loader2,
  UserPlus,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface DashboardData {
  leaveBalance: LeaveBalance[];
  clBalance: number;
  todayAttendance: AttendanceRecord | null;
  pendingLeaves: number;
  pendingExpenses: number;
  pendingTasks: number;
}

// ══════════════════════════════════════════════════════════════
// DashboardHome Component
// ══════════════════════════════════════════════════════════════

export default function DashboardHome({
  employee,
  role,
  dashboardData,
  loading,
  onNavigate,
  onCheckIn,
  onCheckOut,
  checkInLoading,
  checkOutLoading,
}: {
  employee: Employee;
  role: EmployeeRole;
  dashboardData: DashboardData | null;
  loading: boolean;
  onNavigate: (page: string) => void;
  onCheckIn: () => Promise<void>;
  onCheckOut: () => Promise<void>;
  checkInLoading: boolean;
  checkOutLoading: boolean;
}) {
  // Live clock
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hasApprovals = canApprove(role) && dashboardData
    && (dashboardData.pendingLeaves + dashboardData.pendingExpenses) > 0;

  const quickActions = [
    { key: 'attendance', label: 'History', icon: CalendarDays, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { key: 'leaves', label: 'Leave', icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50' },
    { key: 'tasks', label: 'Tasks', icon: ClipboardList, color: 'text-violet-600', bg: 'bg-violet-50' },
    { key: 'expenses', label: 'Expenses', icon: Receipt, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'announcements', label: 'Notices', icon: Megaphone, color: 'text-rose-600', bg: 'bg-rose-50' },
    { key: 'helpdesk', label: 'Help Desk', icon: CircleHelp, color: 'text-sky-600', bg: 'bg-sky-50' },
    { key: 'register', label: 'Register', icon: UserPlus, color: 'text-teal-600', bg: 'bg-teal-50' },
  ];

  // Attendance helpers
  const att = dashboardData?.todayAttendance;
  const attStatus = att?.status || null;
  const canCheckIn = !attStatus || attStatus === 'absent' || attStatus === 'holiday' || attStatus === 'leave';
  const canCheckOut = attStatus === 'checked_in';
  const isCheckedOut = attStatus === 'checked_out' || attStatus === 'present';

  const formatAttTime = (iso: string | undefined) => {
    if (!iso) return null;
    // Handle time-only values from MySQL TIME column (HH:MM:SS or HH:MM)
    const timeMatch = iso.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2]);
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    }
    // Handle datetime strings
    const d = parseIST((iso || '').replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  const calcHours = (cIn: string | undefined, cOut: string | undefined) => {
    if (!cIn) return null;
    const timeInMatch = cIn.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    let startMs: number;
    if (timeInMatch) {
      // Time-only: use today's date as base
      const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      startMs = new Date(ist.getFullYear(), ist.getMonth(), ist.getDate(), parseInt(timeInMatch[1]), parseInt(timeInMatch[2])).getTime();
    } else {
      startMs = parseIST(cIn.replace(' ', 'T')).getTime();
    }
    let endMs: number;
    if (cOut) {
      const timeOutMatch = cOut.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (timeOutMatch) {
        const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        endMs = new Date(ist.getFullYear(), ist.getMonth(), ist.getDate(), parseInt(timeOutMatch[1]), parseInt(timeOutMatch[2])).getTime();
      } else {
        endMs = parseIST(cOut.replace(' ', 'T')).getTime();
      }
    } else {
      endMs = Date.now();
    }
    if (!startMs || isNaN(startMs) || endMs < startMs) return null;
    const diffMs = endMs - startMs;
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  const statusLabel = !attStatus ? 'Not Marked' :
    attStatus === 'checked_in' ? 'Checked In' :
    attStatus === 'checked_out' ? 'Checked Out' :
    attStatus === 'late' ? 'Late' :
    attStatus === 'present' ? 'Present' :
    attStatus === 'absent' ? 'Absent' : attStatus;
  const statusColor = attStatus === 'checked_in' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    attStatus === 'checked_out' ? 'bg-slate-100 text-slate-600 border-slate-200' :
    attStatus === 'late' ? 'bg-amber-100 text-amber-700 border-amber-200' :
    attStatus === 'present' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    'bg-gray-100 text-gray-600 border-gray-200';
  const checkInTime = formatAttTime(att?.check_in);
  const checkOutTime = formatAttTime(att?.check_out);
  const hoursWorked = calcHours(att?.check_in, att?.check_out);
  const showHoursLive = !!checkInTime && !checkOutTime;

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

      {/* ═══ Attendance Check In/Out Card ═══ */}
      <Card className="border-2 border-emerald-200 shadow-md overflow-hidden">
        {/* Live clock header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-4 text-white text-center">
          <div className="flex items-center justify-center gap-2 mb-0.5">
            <Timer className="w-4 h-4 text-white/80" />
            <p className="text-xs font-medium text-white/80 uppercase tracking-wider">Current Time</p>
          </div>
          <p className="text-3xl font-bold tabular-nums tracking-tight">
            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
          </p>
          <p className="text-xs text-white/70 mt-0.5">
            {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <CardContent className="p-5 space-y-4">
          {loading ? (
            <div className="space-y-3">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-16 flex-1 rounded-xl" />
                <Skeleton className="h-16 flex-1 rounded-xl" />
                <Skeleton className="h-16 flex-1 rounded-xl" />
              </div>
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : (
            <>
              {/* Status badge row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium text-gray-700">Today&apos;s Attendance</span>
                </div>
                <Badge variant="outline" className={`text-xs font-medium ${statusColor} ${attStatus === 'checked_in' ? 'animate-pulse' : ''}`}>
                  {statusLabel}
                </Badge>
              </div>

              {/* Check In / Check Out / Hours row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-[10px] font-medium text-emerald-600 uppercase">Check In</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{checkInTime || '—'}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <LogOut className="w-3.5 h-3.5 text-rose-600" />
                    <p className="text-[10px] font-medium text-rose-600 uppercase">Check Out</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{checkOutTime || '—'}</p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Timer className="w-3.5 h-3.5 text-sky-600" />
                    <p className="text-[10px] font-medium text-sky-600 uppercase">
                      Hours {showHoursLive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{hoursWorked || '—'}</p>
                </div>
              </div>

              {/* Location */}
              {att?.location && (
                <div className="flex items-center gap-2 px-1">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 shrink-0">
                    <MapPin className="w-3 h-3 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-400">Location</p>
                    <p className="text-xs font-medium text-gray-700 truncate">{att.location}</p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3">
                {canCheckIn && (
                  <Button
                    className="flex-1 h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-lg shadow-emerald-200"
                    onClick={onCheckIn}
                    disabled={checkInLoading}
                  >
                    {checkInLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                    {checkInLoading ? 'Checking In...' : 'Check In'}
                  </Button>
                )}
                {canCheckOut && (
                  <Button
                    className="flex-1 h-12 text-base font-semibold bg-rose-600 hover:bg-rose-700 text-white gap-2 shadow-lg shadow-rose-200"
                    onClick={onCheckOut}
                    disabled={checkOutLoading}
                  >
                    {checkOutLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                    {checkOutLoading ? 'Checking Out...' : 'Check Out'}
                  </Button>
                )}
                {isCheckedOut && (
                  <div className="flex-1 flex items-center justify-center gap-2 h-12 rounded-lg bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-700">Done for today</span>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard loading={loading} icon={<Leaf className="w-3.5 h-3.5 text-emerald-500" />} label="Leave Balance" value={String(dashboardData?.clBalance ?? 0)} subtext="CL remaining" />
        {canApprove(role) && (
          <SummaryCard loading={loading} icon={<CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />} label="Approvals" value={String((dashboardData?.pendingLeaves ?? 0) + (dashboardData?.pendingExpenses ?? 0))} subtext="Pending action" />
        )}
        <SummaryCard loading={loading} icon={<LogIn className="w-3.5 h-3.5 text-emerald-500" />} label="Today" value={dashboardData?.todayAttendance
            ? dashboardData.todayAttendance.status === 'checked_in'
              ? 'Checked In'
              : dashboardData.todayAttendance.status === 'checked_out'
                ? 'Checked Out'
                : dashboardData.todayAttendance.status === 'present'
                  ? 'Present'
                  : 'Not marked'
            : 'Not marked'} subtext="Attendance" />
        <SummaryCard loading={loading} icon={<ListTodo className="w-3.5 h-3.5 text-violet-500" />} label="Tasks" value={String(dashboardData?.pendingTasks ?? 0)} subtext="Pending" />
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

// ── Internal: Summary Card ─────────────────────────────────
function SummaryCard({ loading, icon, label, value, subtext }: {
  loading: boolean;
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
}) {
  return (
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
              {icon}
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}


