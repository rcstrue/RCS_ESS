'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  fetchProfile, fetchLeaveBalance, fetchLeaves,
  fetchExpenses, fetchTasks, checkIn, checkOut, fetchAttendance,
} from '@/lib/ess-api';
import type { ESSSession, LeaveBalance, AttendanceRecord } from '@/lib/ess-types';
import { todayDateString, getISTMonthKey } from '../helpers';
import type { DashboardData } from '../DashboardHome';

// ══════════════════════════════════════════════════════════════
// useDashboard — Handles all dashboard data loading & check-in/out
// ══════════════════════════════════════════════════════════════

export function useDashboard(session: ESSSession | null) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkOutLoading, setCheckOutLoading] = useState(false);

  const loadDashboardData = useCallback(async () => {
    if (!session) return;
    setDashboardLoading(true);
    try {
      const empId = session.employee.id;
      const todayStr = todayDateString();
      const monthKey = getISTMonthKey();

      const [profileRes, balanceRes, leavesRes, expensesRes, tasksRes, attRes] = await Promise.allSettled([
        fetchProfile(empId),
        fetchLeaveBalance(empId),
        fetchLeaves(empId, 'pending'),
        fetchExpenses(empId, 'pending'),
        fetchTasks({ assigned_to: empId, status: 'pending' }),
        fetchAttendance(empId, monthKey),
      ]);

      const profileData = profileRes.status === 'fulfilled' ? profileRes.value?.data : null;
      const balanceData = balanceRes.status === 'fulfilled' ? balanceRes.value?.data : null;
      const leavesData = leavesRes.status === 'fulfilled' ? leavesRes.value?.data : null;
      const expensesData = expensesRes.status === 'fulfilled' ? expensesRes.value?.data : null;
      const tasksData = tasksRes.status === 'fulfilled' ? tasksRes.value?.data : null;
      const attData = attRes.status === 'fulfilled' ? attRes.value?.data : null;

      let todayAttendance: AttendanceRecord | null = null;
      if (attData?.items) {
        todayAttendance = attData.items.find((r: AttendanceRecord) => r.date === todayStr) ?? null;
      }
      // Cross-midnight fallback: if no today record, find latest record
      // that is still checked_in with no check_out (overnight session)
      if (!todayAttendance && attData?.items?.length) {
        const latestRecord = attData.items[attData.items.length - 1] as AttendanceRecord;
        if (latestRecord?.status === 'checked_in' && !latestRecord.check_out) {
          todayAttendance = latestRecord;
        }
      }
      if (!todayAttendance && profileData?.recent_attendance) {
        todayAttendance = profileData.recent_attendance.find((r: AttendanceRecord) => r.date === todayStr) ?? null;
        // Cross-midnight fallback from profile data
        if (!todayAttendance && profileData.recent_attendance.length) {
          const latestProfile = profileData.recent_attendance[profileData.recent_attendance.length - 1];
          if (latestProfile?.status === 'checked_in' && !latestProfile.check_out) {
            todayAttendance = latestProfile;
          }
        }
      }

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

  const handleCheckIn = useCallback(async () => {
    if (!session || checkInLoading) return;
    setCheckInLoading(true);
    try {
      const location = await new Promise<string>((resolve) => {
        if (!navigator.geolocation) { resolve('Location unavailable'); return; }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
          () => resolve('Location denied'),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
      const { data, error } = await checkIn({ employee_id: session.employee.id, location });
      if (error) { toast.error(error); }
      else if (data) { toast.success('Checked in successfully!'); loadDashboardData(); }
    } catch { toast.error('Check-in failed. Please try again.'); }
    finally { setCheckInLoading(false); }
  }, [session, checkInLoading, loadDashboardData]);

  const handleCheckOut = useCallback(async () => {
    if (!session) return;
    const attendanceId = dashboardData?.todayAttendance?.id;
    if (!attendanceId) { toast.error('No active check-in found. Please check in first.'); return; }
    if (checkOutLoading) return;
    setCheckOutLoading(true);
    try {
      const { data, error } = await checkOut(dashboardData.todayAttendance.id);
      if (error) { toast.error(error); }
      else if (data) { toast.success('Checked out successfully!'); loadDashboardData(); }
    } catch { toast.error('Check-out failed. Please try again.'); }
    finally { setCheckOutLoading(false); }
  }, [session, dashboardData, checkOutLoading, loadDashboardData]);

  useEffect(() => {
    if (session) loadDashboardData();
  }, [session, loadDashboardData]);

  return {
    dashboardData,
    dashboardLoading,
    checkInLoading,
    checkOutLoading,
    loadDashboardData,
    handleCheckIn,
    handleCheckOut,
  };
}
