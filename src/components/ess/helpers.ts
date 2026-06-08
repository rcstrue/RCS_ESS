// ══════════════════════════════════════════════════════════════
// ESS Helpers — Role logic, formatting, utilities
// ══════════════════════════════════════════════════════════════

import type { Employee, EmployeeRole } from '@/lib/ess-types';

// ── Role Detection ──────────────────────────────────────────
export function detectRole(employee: Employee): EmployeeRole {
  const category = (employee.worker_category || '').toLowerCase();
  const role = (employee.employee_role || '').toLowerCase();
  const designation = (employee.designation || '').toLowerCase();

  // Admin
  if (role === 'admin') return 'admin';

  // Regional Manager
  if (category.includes('regional') || role.includes('regional') || designation.includes('regional manager')) return 'regional_manager';

  // Field Officer (specific role before manager check)
  if (category.includes('field officer') || designation.includes('field officer')) return 'field_officer';

  // Manager / Area Manager
  if (role === 'manager' || category.includes('manager') || designation.includes('manager') || category.includes('area manager') || designation.includes('area manager')) return 'manager';

  // Supervisor / Team Lead
  if (category.includes('supervisor') || category.includes('team lead') || role.includes('supervisor') || designation.includes('supervisor') || designation.includes('team lead')) return 'supervisor';

  return 'employee';
}

// ── Directory Visibility ──────────────────────────────────
export function canViewDirectory(role: EmployeeRole): boolean {
  return role === 'manager' || role === 'regional_manager' || role === 'field_officer' || role === 'supervisor' || role === 'admin';
}

export function canApprove(role: EmployeeRole): boolean {
  return role !== 'employee';
}

export function getScope(role: EmployeeRole): string {
  switch (role) {
    case 'admin': return 'all';
    case 'regional_manager': return 'city';
    case 'manager': return 'unit';
    case 'field_officer': return 'unit';
    case 'supervisor': return 'unit';
    default: return 'self';
  }
}

export function getRoleBadge(role: EmployeeRole): { label: string; className: string } {
  switch (role) {
    case 'admin': return { label: 'Admin', className: 'bg-red-100 text-red-700 border-red-200' };
    case 'regional_manager': return { label: 'Regional Manager', className: 'bg-purple-100 text-purple-700 border-purple-200' };
    case 'field_officer': return { label: 'Field Officer', className: 'bg-orange-100 text-orange-700 border-orange-200' };
    case 'manager': return { label: 'Manager', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'supervisor': return { label: 'Supervisor', className: 'bg-teal-100 text-teal-700 border-teal-200' };
    default: return { label: 'Employee', className: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

// ── Greeting ───────────────────────────────────────────────
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── String Formatting ──────────────────────────────────────
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── IST-safe date helpers ──────────────────────────────────
export function todayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function getCurrentISTDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

export function getISTMonthKey(): string {
  const ist = getCurrentISTDate();
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}`;
}

/** Parse a datetime string into an IST Date object */
export function parseIST(datetimeString: string): Date {
  return new Date(
    new Date(datetimeString).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
  );
}

// ── Reverse Geocoding ────────────────────────────────────
// Simple in-memory cache: "lat,lng" → place name
const geoCache = new Map<string, { name: string; fetchedAt: number }>();
const GEO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = geoCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < GEO_CACHE_TTL) {
    return Promise.resolve(cached.name);
  }

  return fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
    {
      headers: { 'Accept-Language': 'en' },
    }
  )
    .then((r) => r.json())
    .then((data) => {
      if (data && data.display_name) {
        // Prefer a shorter name: area/suburb or city
        const a = data.address || {};
        const parts: string[] = [];
        if (a.suburb || a.neighbourhood || a.village) parts.push(a.suburb || a.neighbourhood || a.village);
        if (a.city || a.town || a.county) parts.push(a.city || a.town || a.county);
        if (a.state) parts.push(a.state);
        const name = parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(',').trim();
        geoCache.set(key, { name, fetchedAt: Date.now() });
        return name;
      }
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    })
    .catch(() => `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
}

/** Convenience: resolve location from AttendanceRecord lat/lng */
export function getLocationName(lat?: number | null, lng?: number | null): Promise<string | null> {
  if (lat == null || lng == null) return Promise.resolve(null);
  return reverseGeocode(lat, lng);
}

// ── High-Accuracy GPS ──────────────────────────────────
// Uses watchPosition to collect multiple readings over a few seconds,
// then picks the most accurate one. A single getCurrentPosition call
// often returns a cell-tower-based fix (100m+). By watching for
// GPS satellite convergence, we routinely achieve ≤20m accuracy.

interface HighAccuracyCoords {
  latitude: number;
  longitude: number;
  accuracy: number; // meters
}

/**
 * Get the most accurate GPS position within a time budget.
 *
 * Strategy (designed for Indian Android phones where GPS convergence is slow):
 * 1. Start watchPosition (enableHighAccuracy + maximumAge: 0)
 * 2. Collect ALL readings (even inaccurate ones) — DON'T reject any
 * 3. Track improvement: if accuracy is improving (getting better), keep waiting
 * 4. If a reading ≤30m is found, accept immediately (satellite lock achieved)
 * 5. After max wait, return the most accurate reading collected
 * 6. Improvement detection: require 3 consecutive improving readings before
 *    declaring convergence (avoids accepting a lucky cell-tower bounce)
 *
 * Why this works better than the old approach:
 * - Old: rejected readings >50m → often collected ZERO readings in 8s →
 *   fallback to getCurrentPosition → cell tower (~1-5km error)
 * - New: collects ALL readings, waits for convergence, gives GPS 15s to
 *   get satellite fix → typically achieves ≤30m accuracy
 */
export function getHighAccuracyPosition(options?: {
  watchMs?: number;       // how long to watch (default 15000ms = 15s)
  fastAccuracy?: number;  // accept immediately if within this (default 30m)
}): Promise<HighAccuracyCoords | null> {
  const {
    watchMs = 15000,
    fastAccuracy = 30,
  } = options || {};

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    const readings: HighAccuracyCoords[] = [];
    let watchId: number | null = null;
    let settled = false;
    let improvingStreak = 0; // count of consecutively improving readings

    const finish = (coords: HighAccuracyCoords | null) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      resolve(coords);
    };

    // Start watching — force fresh GPS, no cache
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (latitude == null || longitude == null) return;

        const reading: HighAccuracyCoords = { latitude, longitude, accuracy: accuracy ?? 999 };

        // Track improvement: is this reading better than the previous best?
        const prevBest = readings.length > 0
          ? Math.min(...readings.map((r) => r.accuracy))
          : Infinity;

        // Collect ALL readings (even inaccurate) — we need the best one at the end
        readings.push(reading);

        // Check if accuracy is improving
        if (reading.accuracy < prevBest) {
          improvingStreak++;
        } else {
          improvingStreak = 0;
        }

        // Fast path: satellite lock achieved — accept immediately
        if (reading.accuracy <= fastAccuracy) {
          finish(reading);
          return;
        }

        // Convergence detected: 3+ consecutive improvements and accuracy < 100m
        // This means GPS is actively converging on satellites
        if (improvingStreak >= 3 && reading.accuracy < 100) {
          finish(reading);
          return;
        }
      },
      () => {
        // GPS error — stop watching, will use fallback below
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,         // never use cached position
        timeout: 20000,        // per-reading timeout (20s)
      },
    );

    // After the watch window, pick the best reading
    setTimeout(() => {
      if (settled) return;

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }

      if (readings.length > 0) {
        // Sort by accuracy (lower = better) and pick the best
        readings.sort((a, b) => a.accuracy - b.accuracy);
        finish(readings[0]);
      } else {
        // No readings at all — fallback to single getCurrentPosition
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (pos.coords.latitude != null && pos.coords.longitude != null) {
              finish({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy ?? 999,
              });
            } else {
              finish(null);
            }
          },
          () => finish(null),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      }
    }, watchMs);
  });
}
