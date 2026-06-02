'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { changePin } from '@/lib/ess-api';
import type { ESSSession } from '@/lib/ess-types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ShieldCheck,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// FirstLoginPinPopup — Dismissable PIN setup popup
// Shows only on first login when employee_code is missing in cache.
// User can Cancel to dismiss (never shown again) or set a new PIN.
// Steps: New PIN → Confirm PIN
// ══════════════════════════════════════════════════════════════

interface FirstLoginPinPopupProps {
  open: boolean;
  session: ESSSession;
  onComplete: (session: ESSSession) => void;
  onDismiss: () => void;
}

export default function FirstLoginPinPopup({
  open,
  session,
  onComplete,
  onDismiss,
}: FirstLoginPinPopupProps) {
  const [newPin, setNewPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [showPins, setShowPins] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const steps = ['new', 'confirm'] as const;
  const step = steps[stepIndex];

  const newRef = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRef = useRef<(HTMLInputElement | null)[]>([]);
  const activeRef = step === 'new' ? newRef : confirmRef;

  // ── PIN input helpers ──────────────────────────────────
  const handlePinInput = useCallback((
    index: number,
    value: string,
    pins: string[],
    setPins: (p: string[]) => void,
  ) => {
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
  }, [activeRef]);

  const handleKeyDown = useCallback((
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
    pins: string[],
    setPins: (p: string[]) => void,
  ) => {
    if (e.key === 'Backspace' && !pins[index] && index > 0) {
      activeRef.current[index - 1]?.focus();
      const updated = [...pins];
      updated[index - 1] = '';
      setPins(updated);
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (step === 'new') handleNext();
      else handleSubmit();
    }
  }, [activeRef, step]);

  // ── Step navigation ────────────────────────────────────
  const handleNext = () => {
    const newFull = newPin.join('');
    if (newFull.length !== 4) {
      toast.error('Enter a 4-digit PIN');
      return;
    }
    setStepIndex(1);
    setTimeout(() => confirmRef.current[0]?.focus(), 50);
  };

  // ── Submit ─────────────────────────────────────────────
  const handleSubmit = async () => {
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
      const { error } = await changePin(
        session.employee.id,
        '',
        newFull,
        true, // is_first_login
      );
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('PIN set successfully!');
      onComplete({ ...session, has_custom_pin: true } as ESSSession);
    } catch {
      toast.error('Failed to set PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Handle Cancel ──────────────────────────────────────
  const handleCancel = () => {
    // Mark as dismissed so it never shows again
    onComplete({ ...session, has_custom_pin: true } as ESSSession);
  };

  // ── Reset on close ─────────────────────────────────────
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      handleCancel();
    }
  };

  // ── Render PIN inputs ──────────────────────────────────
  const renderPinInputs = (
    pins: string[],
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
    setPins: (p: string[]) => void,
  ) => (
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

  const stepLabels: Record<string, string> = { new: 'Create New PIN', confirm: 'Confirm New PIN' };
  const stepSubs: Record<string, string> = {
    new: 'Choose a new 4-digit PIN for your account',
    confirm: 'Re-enter your new PIN to confirm',
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex flex-col items-center gap-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100">
              <KeyRound className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="text-center">
              <DialogTitle className="text-lg">Set Up Your PIN</DialogTitle>
              <DialogDescription className="mt-1">
                {step === 'new'
                  ? 'For security, set a new 4-digit PIN for your account.'
                  : 'Re-enter your new PIN to confirm.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                s === step ? 'bg-emerald-600 text-white' :
                stepIndex > i ? 'bg-emerald-100 text-emerald-700' :
                'bg-gray-100 text-gray-400'
              }`}>
                {i + 1}
              </div>
              {i < steps.length - 1 && <div className={`w-6 h-0.5 ${stepIndex > i ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Step label */}
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">{stepLabels[step]}</p>
          <p className="text-xs text-gray-500 mt-0.5">{stepSubs[step]}</p>
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

        {/* PIN inputs */}
        {step === 'new' && renderPinInputs(newPin, newRef, setNewPin)}
        {step === 'confirm' && renderPinInputs(confirmPin, confirmRef, setConfirmPin)}

        {/* Actions */}
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:gap-2">
          {step === 'confirm' ? (
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              onClick={handleSubmit}
              disabled={confirmPin.join('').length !== 4 || loading}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Setting PIN...</>
              ) : (
                <><ShieldCheck className="w-4 h-4" /> Set PIN & Continue</>
              )}
            </Button>
          ) : (
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              onClick={handleNext}
              disabled={newPin.join('').length !== 4}
            >
              Next
            </Button>
          )}

          {/* Back / Cancel */}
          <div className="flex gap-2 w-full">
            {stepIndex > 0 && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStepIndex(0);
                  setConfirmPin(['', '', '', '']);
                  setTimeout(() => newRef.current[0]?.focus(), 50);
                }}
                disabled={loading}
              >
                Back
              </Button>
            )}
            <Button
              variant="ghost"
              className="flex-1 text-gray-500 hover:text-gray-700"
              onClick={handleCancel}
              disabled={loading}
            >
              {stepIndex === 0 ? 'Skip for Now' : 'Cancel'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
