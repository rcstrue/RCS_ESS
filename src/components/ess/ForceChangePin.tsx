'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { changePin } from '@/lib/ess-api';
import type { ESSSession } from '@/lib/ess-types';

import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  Loader2,
  Eye,
  EyeOff,
  Building2,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// ForceChangePin — Mandatory PIN change screen on first login
// ══════════════════════════════════════════════════════════════

export default function ForceChangePin({
  session,
  onComplete,
  onLogout,
}: {
  session: ESSSession;
  onComplete: (session: ESSSession) => void;
  onLogout: () => void;
}) {
  const [currentPin, setCurrentPin] = useState(['', '', '', '']);
  const [newPin, setNewPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [showPins, setShowPins] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');

  const currentRef = useRef<(HTMLInputElement | null)[]>([]);
  const newRef = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRef = useRef<(HTMLInputElement | null)[]>([]);

  const activeRef = step === 'current' ? currentRef : step === 'new' ? newRef : confirmRef;

  // ── PIN input helpers ──────────────────────────────────
  function handlePinInput(
    index: number,
    value: string,
    pins: string[],
    setPins: (p: string[]) => void,
  ) {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 4);
      const updated = [...pins];
      digits.split('').forEach((d, i) => {
        if (index + i < 4) updated[index + i] = d;
      });
      setPins(updated);
      const nextEmpty = updated.findIndex((p, i) => i > index && p === '');
      if (nextEmpty !== -1) activeRef.current[nextEmpty]?.focus();
      else activeRef.current[3]?.focus();
      return;
    }

    if (!/^\d*$/.test(value)) return;

    const updated = [...pins];
    updated[index] = value;
    setPins(updated);

    if (value && index < 3) {
      activeRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
    pins: string[],
    setPins: (p: string[]) => void,
  ) {
    if (e.key === 'Backspace' && !pins[index] && index > 0) {
      activeRef.current[index - 1]?.focus();
      const updated = [...pins];
      updated[index - 1] = '';
      setPins(updated);
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNext();
    }
  }

  // ── Step navigation ────────────────────────────────────
  function handleNext() {
    const currentFull = currentPin.join('');
    const newFull = newPin.join('');
    const confirmFull = confirmPin.join('');

    if (step === 'current') {
      if (currentFull.length !== 4) {
        toast.error('Enter your current 4-digit PIN');
        return;
      }
      setStep('new');
      setTimeout(() => newRef.current[0]?.focus(), 50);
    } else if (step === 'new') {
      if (newFull.length !== 4) {
        toast.error('Enter a new 4-digit PIN');
        return;
      }
      if (newFull === currentFull) {
        toast.error('New PIN must be different from current PIN');
        return;
      }
      setStep('confirm');
      setTimeout(() => confirmRef.current[0]?.focus(), 50);
    }
  }

  // ── Submit ─────────────────────────────────────────────
  async function handleSubmit() {
    const currentFull = currentPin.join('');
    const newFull = newPin.join('');
    const confirmFull = confirmPin.join('');

    if (confirmFull.length !== 4) {
      toast.error('Confirm your 4-digit PIN');
      return;
    }
    if (newFull !== confirmFull) {
      toast.error('PINs do not match. Try again.');
      setConfirmPin(['', '', '', '']);
      setTimeout(() => confirmRef.current[0]?.focus(), 50);
      return;
    }

    setLoading(true);
    try {
      const { error } = await changePin(session.employee.id, currentFull, newFull);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('PIN changed successfully!');
      onComplete({ ...session, has_custom_pin: true });
    } catch {
      toast.error('Failed to change PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Render PIN inputs ──────────────────────────────────
  function renderPinInputs(
    pins: string[],
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
    setPins: (p: string[]) => void,
  ) {
    return (
      <div className="flex items-center justify-center gap-3 py-2">
        {pins.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type={showPins ? 'text' : 'password'}
            inputMode="numeric"
            maxLength={4}
            value={digit}
            onChange={(e) => handlePinInput(i, e.target.value, pins, setPins)}
            onKeyDown={(e) => handleKeyDown(i, e, pins, setPins)}
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
    );
  }

  const stepConfig = {
    current: { label: 'Enter Current PIN', sub: 'Enter your temporary/default PIN to verify your identity' },
    new: { label: 'Create New PIN', sub: 'Choose a new 4-digit PIN for your account' },
    confirm: { label: 'Confirm New PIN', sub: 'Re-enter your new PIN to confirm' },
  };

  const current = stepConfig[step];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="h-2 bg-emerald-600" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Icon */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100">
            <ShieldCheck className="w-10 h-10 text-amber-600" />
          </div>
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-gray-900">Set Up Your PIN</h1>
          <p className="text-sm text-gray-500 mt-1">
            For security, you must set a new PIN before continuing.
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-2 mb-6">
          {(['current', 'new', 'confirm'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                s === step ? 'bg-emerald-600 text-white' :
                ['current', 'new', 'confirm'].indexOf(step) > i ? 'bg-emerald-100 text-emerald-700' :
                'bg-gray-100 text-gray-400'
              }`}>
                {i + 1}
              </div>
              {i < 2 && <div className={`w-8 h-0.5 ${['current', 'new', 'confirm'].indexOf(step) > i ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{current.label}</h2>
            <p className="text-xs text-gray-500 mt-1">{current.sub}</p>
          </div>

          {/* Toggle show/hide */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowPins(!showPins)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showPins ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPins ? 'Hide' : 'Show'} PIN
            </button>
          </div>

          {/* Current PIN */}
          {step === 'current' && renderPinInputs(currentPin, currentRef, setCurrentPin)}
          {step === 'new' && renderPinInputs(newPin, newRef, setNewPin)}
          {step === 'confirm' && renderPinInputs(confirmPin, confirmRef, setConfirmPin)}

          {/* Actions */}
          {step !== 'confirm' ? (
            <Button
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              onClick={handleNext}
              disabled={
                (step === 'current' && currentPin.join('').length !== 4) ||
                (step === 'new' && newPin.join('').length !== 4)
              }
            >
              Next
            </Button>
          ) : (
            <Button
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              onClick={handleSubmit}
              disabled={confirmPin.join('').length !== 4 || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Setting PIN...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Set PIN & Continue
                </>
              )}
            </Button>
          )}

          {/* Back navigation */}
          {step !== 'current' && (
            <button
              onClick={() => {
                setStep(step === 'new' ? 'current' : 'new');
                setTimeout(() => {
                  if (step === 'new') currentRef.current[0]?.focus();
                  else newRef.current[0]?.focus();
                }, 50);
              }}
              className="w-full text-center text-sm text-gray-500 hover:text-emerald-600 transition-colors"
            >
              Go back
            </button>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="mt-4 text-sm text-gray-400 hover:text-red-500 transition-colors"
        >
          Logout
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
        <Building2 className="w-3 h-3" />
        RCS Facility Services Pvt. Ltd.
      </div>
    </div>
  );
}
