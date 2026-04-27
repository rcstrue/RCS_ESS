import { useState, useEffect, useCallback } from 'react';
import {
  fetchAttendance,
} from '@/lib/ess-api';
import type { AttendanceRecord } from '@/lib/ess-types';
import { toast } from 'sonner';
import { parseIST } from './helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Timer,
  MapPin,
} from 'lucide-react';

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
  const d = parseIST(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function calculateHours(checkIn: string | undefined, checkOut: string | undefined): string {
  if (!checkIn) return '0h 0m';
  const start = parseIST(checkIn).getTime();
  if (isNaN(start)) return '0h 0m';
  const end = checkOut ? parseIST(checkOut).getTime() : Date.now();
  const diffMs = end - start;
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
    } catch {
      toast.error('Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, [employeeId, navDate]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

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

  // Build a map of date -> status for quick lookup
  const statusMap = new Map<string, AttendanceRecord['status']>();
  records.forEach((r) => statusMap.set(r.date, r.status));

  const isTodayMonth = year === new Date().getFullYear() && month === new Date().getMonth();

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-6">
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
            <div className="space-y-3">
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
              {/* Location row */}
              {todayRecord.location && (
                <div className="flex items-center gap-2 px-1">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 shrink-0">
                    <MapPin className="w-3 h-3 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-400">Location</p>
                    <p className="text-xs font-medium text-gray-700 truncate">{todayRecord.location}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No attendance record for today</p>
              <p className="text-xs mt-1">Go to Home page to check in</p>
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
