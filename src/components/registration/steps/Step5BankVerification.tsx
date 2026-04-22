import { useState, useRef } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, CreditCard, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BankDetails } from '@/types/registration';
import { cn } from '@/lib/utils';
import { verifyIFSC } from '@/lib/api/ifsc';
import { toast } from 'sonner';
import { scrollToError } from '@/lib/utils';

interface Step5Props {
  data: BankDetails;
  onUpdate: (data: Partial<BankDetails>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step5BankVerification({
  data,
  onUpdate,
  onNext,
  onBack,
}: Step5Props) {
  const [ifscData, setIfscData] = useState<{ BANK: string; BRANCH: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const handleAccountNumberChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    onUpdate({ confirmAccountNumber: cleaned });
  };

  const handleIFSCChange = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    onUpdate({ ifscCode: cleaned });
    setIfscData(null);
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};

    // Validate inputs first
    if (!data.ifscCode || data.ifscCode.length !== 11) {
      newErrors.ifscCode = 'Please enter a valid 11-character IFSC code';
    }
    if (!data.confirmAccountNumber) {
      newErrors.confirmAccountNumber = 'Please re-enter your account number';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      scrollToError(Object.keys(newErrors)[0], formRef.current);
      return;
    }

    // Auto-verify on continue
    setIsVerifying(true);
    setErrors({});

    try {
      // Verify IFSC
      const result = await verifyIFSC(data.ifscCode);
      if (!result.success) {
        setErrors({ ifscCode: result.error || 'Invalid IFSC code' });
        scrollToError('ifscCode', formRef.current);
        setIsVerifying(false);
        return;
      }

      if (result.data) {
        setIfscData({ BANK: result.data.BANK, BRANCH: result.data.BRANCH });
        if (result.data.BANK) {
          onUpdate({ bankName: result.data.BANK });
        }
      }

      // Verify account number match
      if (data.confirmAccountNumber !== data.accountNumber) {
        setErrors({ confirmAccountNumber: 'Account number does not match. Please verify and try again.' });
        scrollToError('confirmAccountNumber', formRef.current);
        setIsVerifying(false);
        return;
      }

      toast.success('Bank details verified successfully');
      onNext();
    } catch (error) {
      setErrors({ ifscCode: 'Failed to verify IFSC code. Please try again.' });
      scrollToError('ifscCode', formRef.current);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up" ref={formRef}>
      <div className="form-section">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Verify Bank Account
          </h2>
          <p className="text-sm text-muted-foreground">
            Verify your IFSC code and re-enter your account number
          </p>
        </div>

        {/* Display extracted account (masked) */}
        <div className="p-4 bg-muted/50 rounded-xl mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{data.bankName || 'Bank Name'}</p>
              <p className="text-xs text-muted-foreground">
                Account ending with ****{data.accountNumber?.slice(-4) || '****'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* IFSC Code */}
          <div className="space-y-2" data-field="ifscCode">
            <Label htmlFor="ifscCode" className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              IFSC Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ifscCode"
              name="ifscCode"
              type="text"
              value={data.ifscCode}
              onChange={(e) => handleIFSCChange(e.target.value)}
              placeholder="e.g., SBIN0001234"
              className={cn(errors.ifscCode && 'border-destructive animate-shake')}
              onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              autoComplete="off"
            />
            {errors.ifscCode && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.ifscCode}
              </p>
            )}
            {ifscData && (
              <div className="p-3 bg-success/10 rounded-lg text-sm">
                <p className="font-medium text-success">{ifscData.BANK}</p>
                <p className="text-muted-foreground">{ifscData.BRANCH}</p>
              </div>
            )}
          </div>

          {/* Account Number Verification */}
          <div className="space-y-2" data-field="confirmAccountNumber">
            <Label htmlFor="confirmAccountNumber">
              Re-enter Account Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="confirmAccountNumber"
              name="confirmAccountNumber"
              type="text"
              value={data.confirmAccountNumber}
              onChange={(e) => handleAccountNumberChange(e.target.value)}
              placeholder="Enter your account number"
              inputMode="numeric"
              className={cn(errors.confirmAccountNumber && 'border-destructive animate-shake')}
              onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              autoComplete="off"
            />
            {errors.confirmAccountNumber && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.confirmAccountNumber}
              </p>
            )}
          </div>
        </div>

        {/* Account Details Summary */}
        <div className="mt-6 p-4 bg-muted/30 rounded-xl">
          <h4 className="text-sm font-medium text-foreground mb-3">Bank Details Summary</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bank Name</span>
              <span className="font-medium">{data.bankName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IFSC Code</span>
              <span className="font-medium">{data.ifscCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account Holder</span>
              <span className="font-medium">{data.accountHolderName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1"
          disabled={isVerifying}
        >
          {isVerifying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
