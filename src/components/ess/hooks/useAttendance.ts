'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { checkIn, checkOut, fetchProfile } from '@/lib/ess-api';
import { fetchLeaveBalance, fetchLeaves, fetchExpenses, fetchTasks } from '@/lib/ess-api';
import type { AttendanceRecord, LeaveBalance, EmployeeRole, ESSSession } from '@/lib/ess-types';
import { todayDateString, requestGeolocation } from '../helpers';
import type { DashboardData } from '../types';

// ══════════════════════════════════════════════════════════════
// useDashboard - Manages dashboard data loading
// ══════════════════════════════════════════════════════════════

export function useDashboard(session: ESSSession | null) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    try {
      const empId = session.employee.id;

      const [profileRes, balanceRes, leavesRes, expensesRes, tasksRes] = await Promise.allSettled([
        fetchProfile(empId),
        fetchLeaveBalance(empId),
        fetchLeaves(empId, 'pending'),
        fetchExpenses(empId, 'pending'),
        fetchTasks({ assigned_to: empId, status: 'pending' }),
      ]);

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
      const balances: LeaveBalance[] = Array.isArray(balanceData) ? balanceData : [];
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
      setLoading(false);
    }
  }, [session]);

  // Load on mount / session change
  useEffect(() => {
    if (session) {
      loadDashboardData();
    }
  }, [session, loadDashboardData]);

  return { dashboardData, loading, refreshDashboard: loadDashboardData };
}

// ══════════════════════════════════════════════════════════════
// useCheckInOut - Manages check-in/out state and API calls
// ══════════════════════════════════════════════════════════════

export function useCheckInOut(
  session: ESSSession | null,
  todayAttendance: AttendanceRecord | null,
  onSuccess: () => void,
) {
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkOutLoading, setCheckOutLoading] = useState(false);

  const handleCheckIn = useCallback(async () => {
    if (!session || checkInLoading) return;
    setCheckInLoading(true);
    try {
      const location = await requestGeolocation();
      const { data, error } = await checkIn({ employee_id: session.employee.id, location });
      if (error) {
        toast.error(error);
      } else if (data) {
        toast.success('Checked in successfully!');
        onSuccess();
      }
    } catch {
      toast.error('Check-in failed. Please try again.');
    } finally {
      setCheckInLoading(false);
    }
  }, [session, checkInLoading, onSuccess]);

  const handleCheckOut = useCallback(async () => {
    if (!session || !todayAttendance?.id || checkOutLoading) return;
    setCheckOutLoading(true);
    try {
      const { data, error } = await checkOut(todayAttendance.id);
      if (error) {
        toast.error(error);
      } else if (data) {
        toast.success('Checked out successfully!');
        onSuccess();
      }
    } catch {
      toast.error('Check-out failed. Please try again.');
    } finally {
      setCheckOutLoading(false);
    }
  }, [session, todayAttendance, checkOutLoading, onSuccess]);

  return { checkInLoading, checkOutLoading, handleCheckIn, handleCheckOut };
}
