import { useState, useRef } from 'react';
import { ArrowRight, ArrowLeft, Building2, CreditCard, Hash, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CameraCapture } from '@/components/registration/CameraCapture';
import { BankDetails, DocumentImages } from '@/types/registration';
import { toast } from 'sonner';
import { scrollToError } from '@/lib/utils';
import { uploadBase64Image } from '@/lib/api/config';

interface Step4Props {
  data: BankDetails;
  documents: DocumentImages;
  onUpdate: (data: Partial<BankDetails>) => void;
  onUpdateDocuments: (data: Partial<DocumentImages>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step4BankDocument({
  data,
  documents,
  onUpdate,
  onUpdateDocuments,
  onNext,
  onBack,
}: Step4Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const handleCapture = async (imageData: string) => {
    setIsUploading(true);
    try {
      const { url, error } = await uploadBase64Image(imageData, 'bank-document.jpg', 'bank');
      if (error || !url) {
        toast.error(error || 'Upload failed. Please try again.');
        setIsUploading(false);
        return;
      }
      onUpdateDocuments({ bankDocument: url });
      toast.success('Document uploaded. Please fill in the details.');
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetake = () => {
    onUpdateDocuments({ bankDocument: null });
  };

  const formatIFSC = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return cleaned.slice(0, 11);
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};

    if (!documents.bankDocument) {
      newErrors.document = 'Please scan your bank document';
    }
    if (!data.bankName) {
      newErrors.bankName = 'Bank name is required';
    }
    if (!data.accountNumber || data.accountNumber.length < 9) {
      newErrors.accountNumber = 'Valid account number required';
    }
    if (!data.ifscCode || data.ifscCode.length !== 11) {
      newErrors.ifscCode = 'Valid 11-character IFSC code required';
    }
    if (!data.accountHolderName) {
      newErrors.accountHolderName = 'Account holder name is required';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      scrollToError(Object.keys(newErrors)[0], formRef.current);
      return;
    }
    onNext();
  };

  return (
    <div className="space-y-6 animate-slide-up" ref={formRef}>
      <div className="form-section">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Bank Document Scan
          </h2>
          <p className="text-sm text-muted-foreground">
            Scan your Bank Passbook first page or Cancelled Cheque
          </p>
        </div>

        <CameraCapture
          onCapture={handleCapture}
          capturedImage={documents.bankDocument}
          onRetake={handleRetake}
          documentType="bank-document"
          instruction="Position your passbook or cancelled cheque within the frame"
        />

        {isUploading && (
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading document...
          </div>
        )}

        {errors.document && (
          <p className="text-xs text-destructive mt-2" data-error="document">{errors.document}</p>
        )}
      </div>

      {/* Bank Details - shown after capture */}
      {documents.bankDocument && (
        <div className="form-section">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              Bank Details
            </h3>
            <p className="text-sm text-muted-foreground">
              Fill in your bank account details
            </p>
          </div>

          <div className="space-y-4">
            {/* Bank Name */}
            <div className="space-y-2" data-field="bankName">
              <Label htmlFor="bankName" className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                Bank Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bankName"
                name="bankName"
                value={data.bankName}
                onChange={(e) => onUpdate({ bankName: e.target.value })}
                className={errors.bankName ? 'border-destructive animate-shake' : ''}
                onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                autoComplete="organization"
              />
              {errors.bankName && (
                <p className="text-xs text-destructive">{errors.bankName}</p>
              )}
            </div>

            {/* Account Number */}
            <div className="space-y-2" data-field="accountNumber">
              <Label htmlFor="accountNumber" className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                Account Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="accountNumber"
                name="accountNumber"
                value={data.accountNumber}
                onChange={(e) => onUpdate({ accountNumber: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                className={errors.accountNumber ? 'border-destructive animate-shake' : ''}
                onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                autoComplete="off"
              />
              {errors.accountNumber && (
                <p className="text-xs text-destructive">{errors.accountNumber}</p>
              )}
            </div>

            {/* IFSC Code */}
            <div className="space-y-2" data-field="ifscCode">
              <Label htmlFor="ifscCode" className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-muted-foreground" />
                IFSC Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ifscCode"
                name="ifscCode"
                value={data.ifscCode}
                onChange={(e) => onUpdate({ ifscCode: formatIFSC(e.target.value) })}
                placeholder="XXXX0XXXXXX"
                className={errors.ifscCode ? 'border-destructive animate-shake' : ''}
                onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                autoComplete="off"
              />
              {errors.ifscCode && (
                <p className="text-xs text-destructive">{errors.ifscCode}</p>
              )}
            </div>

            {/* Account Holder Name */}
            <div className="space-y-2" data-field="accountHolderName">
              <Label htmlFor="accountHolderName" className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Account Holder Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="accountHolderName"
                name="accountHolderName"
                value={data.accountHolderName}
                onChange={(e) => onUpdate({ accountHolderName: e.target.value })}
                className={errors.accountHolderName ? 'border-destructive animate-shake' : ''}
                onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                autoComplete="name"
              />
              {errors.accountHolderName && (
                <p className="text-xs text-destructive">{errors.accountHolderName}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1"
          disabled={!documents.bankDocument}
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
