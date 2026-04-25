'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { detectRole } from './helpers';
import { essLogin } from '@/lib/ess-api';
import type { ESSSession } from '@/lib/ess-types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronRight,
  Building2,
  LogIn,
  Loader2,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// LoginScreen Component
// ══════════════════════════════════════════════════════════════

export default function LoginScreen({ onLogin, onBackToRegistration }: {
  onLogin: (session: ESSSession) => void;
  onBackToRegistration: () => void;
}) {
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

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

  const handleLogin = async () => {
    const fullPin = pin.join('');
    if (fullPin.length !== 4) {
      toast.error('Please enter your 4-digit PIN');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await essLogin(mobile.replace(/\D/g, ''), fullPin);
      if (error) {
        toast.error(error);
        return;
      }
      if (!data) {
        toast.error('Login failed. Please try again.');
        return;
      }

      const role = detectRole(data.employee);
      const session: ESSSession = { employee: data.employee, role };
      onLogin(session);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    setPin(['', '', '', '']);
    setShowPin(false);
  };

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
                disabled={pin.join('').length !== 4 || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
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
