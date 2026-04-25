'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { detectRole } from './helpers';
import { essLogin } from '@/lib/ess-api';
import {
  storeEssToken,
  clearRateLimit,
  getRateLimitStatus,
  recordFailedAttempt,
} from '@/lib/ess-auth';
import type { ESSSession } from '@/lib/ess-types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronRight,
  Building2,
  LogIn,
  Loader2,
  ShieldAlert,
  Clock,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// LoginScreen Component — JWT auth, rate-limit UI, force PIN
// ══════════════════════════════════════════════════════════════

export default function LoginScreen({ onLogin, onBackToRegistration, onForcePinChange }: {
  onLogin: (session: ESSSession) => void;
  onBackToRegistration: () => void;
  onForcePinChange: (session: ESSSession) => void;
}) {
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Rate limit state ──────────────────────────────────
  const [rateLimit, setRateLimit] = useState(getRateLimitStatus());
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll rate limit every second when active
  useEffect(() => {
    if (rateLimit.locked || rateLimit.cooldownRemaining > 0) {
      cooldownTimer.current = setInterval(() => {
        const status = getRateLimitStatus();
        setRateLimit(status);
        if (!status.locked && status.cooldownRemaining === 0) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
        }
      }, 1000);
      return () => {
        if (cooldownTimer.current) clearInterval(cooldownTimer.current);
      };
    }
  }, [rateLimit.locked, rateLimit.cooldownRemaining]);

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
    if (rateLimit.locked) {
      toast.error('Account temporarily locked. Please try later.');
      return;
    }
    setShowPin(true);
  };

  const handlePinChange = (index: number, value: string) => {
    if (value.length > 1) {
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

  const handleLogin = useCallback(async () => {
    const fullPin = pin.join('');
    if (fullPin.length !== 4) {
      toast.error('Please enter your 4-digit PIN');
      return;
    }

    // Client-side rate limit check
    if (rateLimit.locked) {
      toast.error(`Account locked. Try again in ${Math.ceil(rateLimit.lockoutRemaining / 60)} minutes.`);
      return;
    }
    if (rateLimit.remainingAttempts <= 0) {
      toast.error(`Too many attempts. Wait ${rateLimit.cooldownRemaining}s.`);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await essLogin(mobile.replace(/\D/g, ''), fullPin);

      // ── Server-side rate limit / lock response ──
      // Read lockout info EVEN when error exists (PHP sends both)
      if (data?.is_locked) {
        const mins = Math.ceil((data.lockout_remaining || 1800) / 60);
        const rlInfo = recordFailedAttempt();
        setRateLimit(rlInfo);
        toast.error(`Account locked for ${mins} minutes. Too many failed attempts.`);
        return;
      }

      if (data?.rate_limit_remaining && data.rate_limit_remaining > 0) {
        const rlInfo = recordFailedAttempt();
        setRateLimit(rlInfo);
        toast.error(`Too many attempts. Wait ${data.rate_limit_remaining}s or try again in a minute.`);
        return;
      }

      // ── Generic error ──
      if (error) {
        // Record failed attempt on client side
        const rlInfo = recordFailedAttempt();
        setRateLimit(rlInfo);

        if (rlInfo.locked) {
          toast.error('Account locked for 30 minutes due to too many failed attempts.');
        } else if (rlInfo.remainingAttempts > 0 && rlInfo.remainingAttempts <= 3) {
          toast.error(`${error} (${rlInfo.remainingAttempts} attempt${rlInfo.remainingAttempts === 1 ? '' : 's'} remaining)`);
        } else {
          toast.error(error);
        }
        return;
      }

      if (!data) {
        const rlInfo = recordFailedAttempt();
        setRateLimit(rlInfo);
        toast.error('Login failed. Please try again.');
        return;
      }

      // ── Success ──
      clearRateLimit();

      // Store JWT token
      if (data.token) {
        storeEssToken(data.token);
      }

      const role = detectRole(data.employee);
      const session: ESSSession = {
        employee: data.employee,
        role,
        token: data.token,
        token_expires_at: data.token_expires_at,
      };

      // Force PIN change on first login
      if (!data.has_custom_pin) {
        toast.warning('Please set a new PIN to continue.');
        onForcePinChange(session);
        return;
      }

      onLogin(session);
    } catch {
      const rlInfo = recordFailedAttempt();
      setRateLimit(rlInfo);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pin, mobile, rateLimit, onLogin, onForcePinChange]);

  const handleResend = () => {
    setPin(['', '', '', '']);
    setShowPin(false);
  };

  // ── Format cooldown for display ───────────────────────
  function formatCooldown(seconds: number): string {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    }
    return `${seconds}s`;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="h-2 bg-emerald-600" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-200 mb-4">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">RCS Facility</h1>
          <p className="text-sm text-gray-500 mt-1">Employee Self-Service</p>
        </div>

        {/* ── Lockdown Banner ── */}
        {rateLimit.locked && (
          <div className="w-full max-w-sm mb-4 p-4 bg-red-50 border border-red-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-sm font-semibold text-red-800">Account Temporarily Locked</p>
            </div>
            <p className="text-xs text-red-600">
              Too many failed login attempts. Your account has been locked for security.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="w-3.5 h-3.5 text-red-500" />
              <p className="text-xs font-medium text-red-700">
                Try again in {formatCooldown(rateLimit.lockoutRemaining)}
              </p>
            </div>
          </div>
        )}

        {/* ── Rate Limit Warning ── */}
        {!rateLimit.locked && rateLimit.remainingAttempts <= 3 && rateLimit.remainingAttempts > 0 && showPin && (
          <div className="w-full max-w-sm mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700">
                {rateLimit.remainingAttempts} attempt{rateLimit.remainingAttempts === 1 ? '' : 's'} remaining.
                {rateLimit.cooldownRemaining > 0 && (
                  <> Wait {formatCooldown(rateLimit.cooldownRemaining)} for reset.</>
                )}
              </p>
            </div>
          </div>
        )}

        {!showPin ? (
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
          <div className="w-full max-w-sm space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Enter your PIN</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Verify with the number ending <span className="font-semibold text-gray-700">******{mobile.slice(-4)}</span>
                </p>
              </div>

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
                disabled={pin.join('').length !== 4 || loading || rateLimit.locked || rateLimit.remainingAttempts <= 0}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : rateLimit.locked ? (
                  <>
                    <ShieldAlert className="w-4 h-4" />
                    Locked
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

      <div className="text-center py-4 text-xs text-gray-400">
        RCS Facility Services Pvt. Ltd.
      </div>
    </div>
  );
}
