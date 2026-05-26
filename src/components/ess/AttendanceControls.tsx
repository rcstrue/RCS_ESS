'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LogIn, LogOut, Clock, Timer, MapPin, CheckCircle2, Loader2 } from 'lucide-react';
import type { AttendanceRecord } from '@/lib/ess-types';
import { formatAttTime, calcWorkHours, getAttendanceStatus } from './helpers';
import { Clock as LiveClock } from './Clock';

// ══════════════════════════════════════════════════════════════
// Props
// ══════════════════════════════════════════════════════════════

interface AttendanceControlsProps {
  attendance: AttendanceRecord | null;
  loading: boolean;
  checkInLoading: boolean;
  checkOutLoading: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
}

// ══════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════

export function AttendanceControls({
  attendance,
  loading,
  checkInLoading,
  checkOutLoading,
  onCheckIn,
  onCheckOut,
}: AttendanceControlsProps) {
  const attStatus = attendance?.status || null;
  const statusInfo = getAttendanceStatus(attStatus);

  const checkInTime = formatAttTime(attendance?.check_in);
  const checkOutTime = formatAttTime(attendance?.check_out);
  const hoursWorked = calcWorkHours(attendance?.check_in, attendance?.check_out);
  const showHoursLive = !!checkInTime && !checkOutTime;

  return (
    <Card className="border-2 border-emerald-200 shadow-md overflow-hidden">
      {/* Live clock header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-4 text-white text-center">
        <LiveClock />
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
              <Badge
                variant="outline"
                className={`text-xs font-medium ${statusInfo.color} ${attStatus === 'checked_in' ? 'animate-pulse' : ''}`}
              >
                {statusInfo.label}
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
            {attendance?.location && (
              <div className="flex items-center gap-2 px-1">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 shrink-0">
                  <MapPin className="w-3 h-3 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400">Location</p>
                  <p className="text-xs font-medium text-gray-700 truncate">{attendance.location}</p>
                </div>
              </div>
            )}

            {/* Action buttons - state-driven logic */}
            <div className="flex gap-3">
              {statusInfo.canCheckIn && (
                <Button
                  className="flex-1 h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-lg shadow-emerald-200"
                  onClick={onCheckIn}
                  disabled={checkInLoading}
                >
                  {checkInLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                  {checkInLoading ? 'Checking In...' : 'Check In'}
                </Button>
              )}
              {statusInfo.canCheckOut && (
                <Button
                  className="flex-1 h-12 text-base font-semibold bg-rose-600 hover:bg-rose-700 text-white gap-2 shadow-lg shadow-rose-200"
                  onClick={onCheckOut}
                  disabled={checkOutLoading}
                >
                  {checkOutLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                  {checkOutLoading ? 'Checking Out...' : 'Check Out'}
                </Button>
              )}
              {statusInfo.isComplete && (
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
  );
}
