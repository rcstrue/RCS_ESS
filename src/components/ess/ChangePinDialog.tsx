'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { changePin } from '@/lib/ess-api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Shield, KeyRound, CheckCircle2, Loader2 } from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// PinInputBoxes Helper
// ══════════════════════════════════════════════════════════════

function PinInputBoxes({
  step, currentPin, newPin, confirmPin, setCurrentPin, setNewPin, setConfirmPin,
}: {
  step: 'current' | 'new' | 'confirm';
  currentPin: string;
  newPin: string;
  confirmPin: string;
  setCurrentPin: (v: string) => void;
  setNewPin: (v: string) => void;
  setConfirmPin: (v: string) => void;
}) {
  const pin = step === 'current' ? currentPin : step === 'new' ? newPin : confirmPin;
  const setPin = step === 'current' ? setCurrentPin : step === 'new' ? setNewPin : setConfirmPin;

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 4 - index);
      setPin(pin.slice(0, index) + digits);
      return;
    }
    if (!/^\d*$/.test(value)) return;
    setPin(pin.slice(0, index) + value + pin.slice(index + 1));
  };

  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <input
          key={`${step}-${i}`}
          type="tel"
          inputMode="numeric"
          maxLength={4}
          value={pin[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onFocus={(e) => e.target.select()}
          className="w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-700 focus:outline-none"
        />
      ))}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// ChangePinDialog
// ══════════════════════════════════════════════════════════════

interface ChangePinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | number;
}

export function ChangePinDialog({ open, onOpenChange, employeeId }: ChangePinDialogProps) {
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const resetAndClose = () => {
    setStep('current');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setLoading(false);
    onOpenChange(false);
  };

  const handleSubmitCurrentPin = async () => {
    if (currentPin.length !== 4) {
      toast.error('Please enter your current 4-digit PIN');
      return;
    }
    setStep('new');
  };

  const handleSubmitNewPin = () => {
    if (newPin.length !== 4) {
      toast.error('Please enter a 4-digit new PIN');
      return;
    }
    setStep('confirm');
  };

  const handleSubmitConfirmPin = async () => {
    if (confirmPin !== newPin) {
      toast.error('PINs do not match. Please try again.');
      setConfirmPin('');
      setStep('new');
      return;
    }

    setLoading(true);
    try {
      const { error } = await changePin(employeeId, currentPin, newPin);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('PIN changed successfully!');
      resetAndClose();
    } catch {
      toast.error('Failed to change PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'confirm') { setStep('new'); setConfirmPin(''); }
    else if (step === 'new') { setStep('current'); setNewPin(''); }
  };

  const stepTitles = { current: 'Enter Current PIN', new: 'Enter New PIN', confirm: 'Confirm New PIN' };
  const stepIcons = { current: Shield, new: KeyRound, confirm: CheckCircle2 };
  const StepIcon = stepIcons[step];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StepIcon className="w-5 h-5 text-emerald-600" />
            {stepTitles[step]}
          </DialogTitle>
          <DialogDescription>
            {step === 'current' && 'Verify your current PIN first'}
            {step === 'new' && 'Choose a new 4-digit PIN'}
            {step === 'confirm' && 'Re-enter your new PIN to confirm'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-3 py-4">
          <PinInputBoxes
            step={step}
            currentPin={currentPin}
            newPin={newPin}
            confirmPin={confirmPin}
            setCurrentPin={setCurrentPin}
            setNewPin={setNewPin}
            setConfirmPin={setConfirmPin}
          />
        </div>

        <div className="flex items-center justify-center gap-2 mb-2">
          {(['current', 'new', 'confirm'] as const).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step ? 'w-8 bg-emerald-500' :
                ['current', 'new', 'confirm'].indexOf(s) < ['current', 'new', 'confirm'].indexOf(step)
                  ? 'w-8 bg-emerald-300'
                  : 'w-8 bg-gray-200'
              }`}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {step !== 'current' && (
            <Button variant="outline" onClick={handleBack} disabled={loading}>Back</Button>
          )}
          <Button
            onClick={
              step === 'current' ? handleSubmitCurrentPin :
              step === 'new' ? handleSubmitNewPin :
              handleSubmitConfirmPin
            }
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
            ) : step === 'confirm' ? (
              'Change PIN'
            ) : (
              'Next'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
