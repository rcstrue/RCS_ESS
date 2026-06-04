import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAttendance,
  checkOut,
} from '@/lib/ess-api';
import type { AttendanceRecord } from '@/lib/ess-types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { parseIST } from './helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LogOut,
  Clock,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Timer,
  Loader2,
  Download,
} from 'lucide-react';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useExportCSV } from './hooks/useExportCSV';

// ─── Props ───────────────────────────────────────────────────────────
interface AttendancePageProps {
  employeeId: number;
  employeeName: string;
  role: string;
}

// ─── Status config ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  AttendanceRecord['status'],
  { label: string; dotColor: string; badgeClass: string; pulse?: boolean }
> = {
  present: { label: 'Present', dotColor: 'bg-emerald-500', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  checked_in: { label: 'Checked In', dotColor: 'bg-emerald-500', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200', pulse: true },
  checked_out: { label: 'Checked Out', dotColor: 'bg-emerald-500', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  late: { label: 'Late', dotColor: 'bg-amber-500', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  absent: { label: 'Absent', dotColor: 'bg-rose-500', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
  leave: { label: 'Leave', dotColor: 'bg-sky-500', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200' },
  holiday: { label: 'Holiday', dotColor: 'bg-slate-400', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  half_day: { label: 'Half Day', dotColor: 'bg-orange-500', badgeClass: 'bg-orange-100 text-orange-800 border-orange-200' },
};

// ─── Helpers ─────────────────────────────────────────────────────────
function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  // Handle time-only strings (e.g. "09:30:00")
  const timeOnlyRegex = /^\d{1,2}:\d{2}(:\d{2})?$/;
  if (timeOnlyRegex.test(iso.trim())) {
    const parts = iso.split(':');
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1] || '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  const d = parseIST(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(iso: string): string {
  const d = parseIST(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function calculateHours(checkIn: string | undefined, checkOut: string | undefined): string {
  if (!checkIn) return '0h 0m';
  const timeOnlyRegex = /^\d{1,2}:\d{2}(:\d{2})?$/;

  // Convert a time-only string to today's timestamp in IST
  const timeOnlyToTodayMs = (timeStr: string): number => {
    const [h, m, s] = timeStr.split(':').map(Number);
    const now = new Date();
    const istStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istDate = new Date(istStr);
    istDate.setHours(h, m, s || 0, 0);
    return istDate.getTime();
  };

  let startMs: number;
  let endMs: number;
  if (timeOnlyRegex.test(checkIn)) {
    startMs = timeOnlyToTodayMs(checkIn);
  } else {
    startMs = parseIST(checkIn).getTime();
  }
  if (isNaN(startMs)) return '0h 0m';
  if (checkOut) {
    if (timeOnlyRegex.test(checkOut)) {
      endMs = timeOnlyToTodayMs(checkOut);
    } else {
      endMs = parseIST(checkOut).getTime();
    }
  } else {
    endMs = Date.now();
  }
  const diffMs = endMs - startMs;
  if (diffMs < 0) return '0h 0m';
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function todayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// ─── Component ───────────────────────────────────────────────────────
export default function AttendancePage({ employeeId, employeeName, role }: AttendancePageProps) {
  // Calendar navigation
  const [navDate, setNavDate] = useState(() => new Date());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [checkOutLoading, setCheckOutLoading] = useState(false);
  const clockRef = useRef<ReturnType<typeof setInterval>>();

  // Status filter
  const [statusFilter, setStatusFilter] = useState('all');

  // Pull-to-refresh
  const pullRefresh = usePullToRefresh<HTMLDivElement>({
    onRefresh: loadAttendance,
  });

  // CSV Export
  const { exportCSV } = useExportCSV();

  const handleExportAttendance = () => {
    const headers = ['Date', 'Check In', 'Check Out', 'Hours', 'Status', 'Location'];
    const rows = records
      .filter((r) => statusFilter === 'all' || r.status === statusFilter)
      .map((r) => [
        formatDate(r.date),
        formatTime(r.check_in),
        formatTime(r.check_out),
        calculateHours(r.check_in, r.check_out),
        STATUS_CONFIG[r.status]?.label ?? r.status,
        r.latitude && r.longitude ? `${r.latitude}, ${r.longitude}` : '—',
      ]);
    exportCSV(
      `Attendance_${getMonthLabel(navDate).replace(/\s+/g, '_')}.csv`,
      headers,
      rows
    );
    toast.success('Attendance exported successfully');
  };

  // Filtered records
  const filteredRecords = statusFilter === 'all' ? records : records.filter((r) => r.status === statusFilter);

  // Track the active attendance ID even across month navigations
  // (user checks in one month, navigates to another, needs to check out)
  const activeAttendanceRef = useRef<number | null>(null);

  // Live clock
  useEffect(() => {
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, []);

  // Fetch attendance records
  const loadAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const monthKey = getMonthKey(navDate);
      const { data: res, error: fetchError } = await fetchAttendance(employeeId, monthKey);
      if (fetchError) {
        toast.error(fetchError);
        return;
      }
      const items = res?.items ?? [];
      setRecords(items);

      // Find today's record
      const todayStr = todayDateString();
      const today = items.find((r) => r.date === todayStr) ?? null;
      setTodayRecord(today);

      // Maintain cross-month active attendance ref
      if (today?.status === 'checked_in' && !today.check_out) {
        activeAttendanceRef.current = today.id;
      } else if (todayRecord && todayRecord?.status === 'checked_in' && !today.check_out) {
        // Today's previous record was checked in — keep tracking
      } else {
        // Check if the active ref still has an active record in the current month
        const activeRecord = items.find((r) => r.id === activeAttendanceRef.current);
        if (!activeRecord || activeRecord.check_out) {
          activeAttendanceRef.current = null;
        }
      }
    } catch {
      toast.error('Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, [employeeId, navDate]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // Geolocation helper
  const requestGeolocation = (): Promise<string> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve('Location unavailable');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          resolve(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        },
        () => resolve('Location denied'),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  };

  // Check Out
  const handleCheckOut = async () => {
    // Use the tracked active attendance ID (cross-month safe), fall back to todayRecord
    const attendanceId = todayRecord?.id || activeAttendanceRef.current;
    if (!attendanceId) {
      toast.error('No active check-in found. Please check in first.');
      return;
    }
    try {
      setCheckOutLoading(true);
      const { error: checkOutError } = await checkOut(attendanceId);
      if (checkOutError) {
        toast.error(checkOutError);
        return;
      }
      activeAttendanceRef.current = null;
      toast.success('Checked out successfully!');
      // Always reload attendance to get authoritative state
      await loadAttendance();
    } catch {
      toast.error('Check-out failed. Please try again.');
    } finally {
      setCheckOutLoading(false);
    }
  };

  // Month navigation
  const goToPrevMonth = () => {
    setNavDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const goToNextMonth = () => {
    setNavDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  // Calendar rendering
  const year = navDate.getFullYear();
  const month = navDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const todayStr = todayDateString();

  // Build a map of date -> status for quick lookup (from filtered records)
  const statusMap = new Map<string, AttendanceRecord['status']>();
  filteredRecords.forEach((r) => statusMap.set(r.date, r.status));

  const isTodayMonth = year === new Date().getFullYear() && month === new Date().getMonth();

  const hasCheckedIn = todayRecord?.status === 'checked_in' || todayRecord?.status === 'checked_out';
  const canCheckOut = todayRecord?.status === 'checked_in' || (activeAttendanceRef.current && !todayRecord?.check_out);

  // ─── Render ──────────────────────────────────────────────────────
  // Pull-to-refresh wrapper
  const pullRefreshProps = {
    ref: pullRefresh.containerRef,
    onTouchStart: pullRefresh.handleTouchStart,
    onTouchMove: pullRefresh.handleTouchMove,
    onTouchEnd: pullRefresh.handleTouchEnd,
  };

  return (
    <div {...pullRefreshProps} className="space-y-4 pb-6" style={{ touchAction: 'pan-y' }}>
      {/* Pull-to-refresh indicator */}
      <div style={pullRefresh.pullIndicatorStyle} className="flex items-center justify-center">
        <Loader2 className={cn("h-5 w-5 text-primary", (pullRefresh.isRefreshing || pullRefresh.pullDistance > 20) && "animate-spin")} />
      </div>

      {/* Export + Status filter row */}
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-sm w-auto">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="present">Present</SelectItem>
            <SelectItem value="absent">Absent</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="half_day">Half Day</SelectItem>
            <SelectItem value="leave">Leave</SelectItem>
            <SelectItem value="holiday">Holiday</SelectItem>
            <SelectItem value="checked_in">Checked In</SelectItem>
            <SelectItem value="checked_out">Checked Out</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportAttendance}>
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>
      {/* ── Check In / Out Action Card ─────────────────────────── */}
      <Card className="border-2">
        <CardContent className="p-4 sm:p-6">
          {/* Current time */}
          <div className="text-center mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Current Time</p>
            <p className="text-3xl sm:text-4xl font-bold tabular-nums tracking-tight">
              {currentTime.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {currentTime.toLocaleDateString('en-IN', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>

          <Separator className="my-4" />

          {/* Action buttons */}
          <div className="flex flex-col items-center gap-3">
            {canCheckOut && (
              <Button
                size="xl"
                className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white text-lg gap-2 shadow-lg shadow-rose-200"
                onClick={handleCheckOut}
                disabled={checkOutLoading}
              >
                {checkOutLoading ? (
                  <Clock className="h-5 w-5 animate-spin" />
                ) : (
                  <LogOut className="h-5 w-5" />
                )}
                {checkOutLoading ? 'Checking Out...' : 'Check Out'}
              </Button>
            )}

            {hasCheckedIn && !canCheckOut && (
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg">
                <LogOut className="h-4 w-4" />
                <span className="text-sm font-medium">You have checked out for today</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Today's Status Card ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Today's Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !todayRecord ? (
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
          ) : todayRecord ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Check In</p>
                <p className="text-lg font-semibold">{formatTime(todayRecord.check_in)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Check Out</p>
                <p className="text-lg font-semibold">{formatTime(todayRecord.check_out)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge
                  className={`mt-1 ${STATUS_CONFIG[todayRecord.status].badgeClass} ${STATUS_CONFIG[todayRecord.status].pulse ? 'animate-pulse' : ''}`}
                  variant="outline"
                >
                  {STATUS_CONFIG[todayRecord.status].label}
                </Badge>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Hours Worked</p>
                <p className="text-lg font-semibold">{calculateHours(todayRecord.check_in, todayRecord.check_out)}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No attendance record for today</p>

            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Monthly Calendar View ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Attendance Calendar
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[130px] text-center">{getMonthLabel(navDate)}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-medium text-muted-foreground py-1"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells before the 1st */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-10 sm:h-12" />
                ))}

                {/* Day cells */}
                {Array.from({ length: daysInMonth }).map((_, idx) => {
                  const day = idx + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const status = statusMap.get(dateStr);
                  const isToday = dateStr === todayStr && isTodayMonth;

                  return (
                    <div
                      key={dateStr}
                      className={`
                        relative flex flex-col items-center justify-center
                        h-10 sm:h-12 rounded-md text-sm transition-colors
                        ${isToday ? 'bg-primary/10 ring-1 ring-primary/30' : ''}
                      `}
                    >
                      <span
                        className={`text-xs sm:text-sm ${
                          isToday ? 'font-bold text-primary' : 'text-foreground/80'
                        }`}
                      >
                        {day}
                      </span>
                      {status && (
                        <span
                          className={`absolute bottom-1 w-2 h-2 rounded-full ${STATUS_CONFIG[status]?.dotColor ?? 'bg-gray-400'}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Status Legend ────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Legend</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${cfg.dotColor}`} />
                <span className="text-xs text-muted-foreground">{cfg.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
