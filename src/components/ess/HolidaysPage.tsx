'use client';

import { CalendarDays, PartyPopper } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import PageHeader from './PageHeader';

// ══════════════════════════════════════════════════════════════
// HolidaysPage — Indian Public Holidays Calendar
// ══════════════════════════════════════════════════════════════

type HolidayType = 'national' | 'optional' | 'restricted';

interface Holiday {
  date: number;
  month: number; // 1-indexed
  name: string;
  type: HolidayType;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const HOLIDAYS_2026: Holiday[] = [
  { date: 26, month: 1, name: 'Republic Day', type: 'national' },
  { date: 14, month: 3, name: 'Holi', type: 'national' },
  { date: 2, month: 4, name: 'Ram Navami', type: 'optional' },
  { date: 14, month: 4, name: 'Ambedkar Jayanti', type: 'national' },
  { date: 18, month: 4, name: 'Good Friday', type: 'optional' },
  { date: 1, month: 5, name: 'Labour Day', type: 'national' },
  { date: 5, month: 6, name: 'Bakri Eid', type: 'optional' },
  { date: 15, month: 8, name: 'Independence Day', type: 'national' },
  { date: 27, month: 8, name: 'Janmashtami', type: 'optional' },
  { date: 5, month: 9, name: 'Teachers\' Day', type: 'restricted' },
  { date: 2, month: 10, name: 'Gandhi Jayanti', type: 'national' },
  { date: 20, month: 10, name: 'Diwali', type: 'national' },
  { date: 5, month: 11, name: 'Guru Nanak Jayanti', type: 'restricted' },
  { date: 25, month: 12, name: 'Christmas', type: 'national' },
  { date: 31, month: 12, name: 'New Year\'s Eve', type: 'optional' },
];

const TYPE_CONFIG: Record<HolidayType, { label: string; badgeClass: string; dotClass: string }> = {
  national: {
    label: 'National',
    badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
    dotClass: 'bg-rose-500',
  },
  optional: {
    label: 'Optional',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  restricted: {
    label: 'Restricted',
    badgeClass: 'bg-sky-100 text-sky-700 border-sky-200',
    dotClass: 'bg-sky-500',
  },
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayOfWeek(day: number, month: number, year: number): number {
  return new Date(year, month - 1, day).getDay();
}

// Group holidays by month
const holidaysByMonth = MONTH_NAMES.map((name, index) => {
  const month = index + 1;
  const holidays = HOLIDAYS_2026.filter((h) => h.month === month).sort((a, b) => a.date - b.date);
  return { month, name, holidays };
}).filter((m) => m.holidays.length > 0);

export default function HolidaysPage() {
  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Holiday Calendar"
        subtitle="Indian public holidays for 2026"
      />

      {/* Year Header */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-semibold">2026</h2>
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(TYPE_CONFIG) as HolidayType[]).map((type) => {
              const cfg = TYPE_CONFIG[type];
              return (
                <div key={type} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${cfg.dotClass}`} />
                  <Badge variant="outline" className={`text-[10px] ${cfg.badgeClass}`}>
                    {cfg.label}
                  </Badge>
                </div>
              );
            })}
            <span className="text-xs text-muted-foreground ml-auto">
              {HOLIDAYS_2026.length} holidays total
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Sections */}
      <div className="space-y-4">
        {holidaysByMonth.map(({ month, name, holidays }) => (
          <Card key={month}>
            <CardContent className="p-4">
              {/* Month header */}
              <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50">
                  <span className="text-xs font-bold text-emerald-700">{month}</span>
                </div>
                <h3 className="font-semibold text-gray-900">{name} 2026</h3>
                <Badge variant="secondary" className="text-[10px] ml-auto">
                  {holidays.length} holiday{holidays.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Calendar grid row showing the week */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAY_NAMES.map((day) => (
                  <div key={day} className="text-center text-[10px] text-muted-foreground font-medium">
                    {day}
                  </div>
                ))}
              </div>

              {/* Holiday rows */}
              <div className="space-y-2">
                {holidays.map((holiday) => {
                  const dayOfWeek = getDayOfWeek(holiday.date, holiday.month, 2026);
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const cfg = TYPE_CONFIG[holiday.type];

                  return (
                    <div
                      key={`${holiday.month}-${holiday.date}`}
                      className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      {/* Date cell */}
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg border shrink-0">
                        <div className="text-center">
                          <p className="text-xs font-bold leading-none">{holiday.date}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">{DAY_NAMES[dayOfWeek]}</p>
                        </div>
                      </div>

                      {/* Holiday name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{holiday.name}</p>
                      </div>

                      {/* Type badge */}
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${cfg.badgeClass}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
