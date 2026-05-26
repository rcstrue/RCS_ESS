'use client';

import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

/**
 * Live clock component - updates every second.
 * Uses en-IN locale (IST timezone) for consistent time display.
 * Properly cleans up interval on unmount to prevent memory leaks.
 */
export function Clock({ className }: { className?: string }) {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={className}>
      <div className="flex items-center justify-center gap-2 mb-0.5">
        <Timer className="w-4 h-4 text-white/80" />
        <p className="text-xs font-medium text-white/80 uppercase tracking-wider">Current Time</p>
      </div>
      <p className="text-3xl font-bold tabular-nums tracking-tight">
        {currentTime.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })}
      </p>
      <p className="text-xs text-white/70 mt-0.5">
        {currentTime.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>
    </div>
  );
}
