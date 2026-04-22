import { useState, useRef } from 'react';
import { ArrowRight, ArrowLeft, MapPin, Hash, Building, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CameraCapture } from '@/components/registration/CameraCapture';
import { AadhaarDetails, DocumentImages, INDIAN_STATES } from '@/types/registration';
import { toast } from 'sonner';
import { scrollToError } from '@/lib/utils';
import { uploadBase64Image } from '@/lib/api/config';

interface Step3Props {
  data: AadhaarDetails;
  documents: DocumentImages;
  onUpdate: (data: Partial<AadhaarDetails>) => void;
  onUpdateDocuments: (data: Partial<DocumentImages>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step3AadhaarBack({
  data,
  documents,
  onUpdate,
  onUpdateDocuments,
  onNext,
  onBack,
}: Step3Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const handleCapture = async (imageData: string) => {
    setIsUploading(true);
    try {
      const { url, error } = await uploadBase64Image(imageData, 'aadhaar-back.jpg', 'aadhaar');
      if (error || !url) {
        toast.error(error || 'Upload failed. Please try again.');
        setIsUploading(false);
        return;
      }
      onUpdateDocuments({ aadhaarBack: url });
      toast.success('Document uploaded. Please fill in the details.');
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetake = () => {
    onUpdateDocuments({ aadhaarBack: null });
  };

  const validatePinCode = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 6) {
      onUpdate({ pinCode: cleaned });
    }
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};

    if (!documents.aadhaarBack) {
      newErrors.document = 'Please scan your Aadhaar card back';
    }
    if (!data.address) {
      newErrors.address = 'Address is required';
    }
    if (data.pinCode.length !== 6) {
      newErrors.pinCode = 'Valid 6-digit PIN code required';
    }
    if (!data.state) {
      newErrors.state = 'State is required';
    }
    if (!data.district) {
      newErrors.district = 'District is required';
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
            Aadhaar Card - Back Side
          </h2>
          <p className="text-sm text-muted-foreground">
            Scan the back side of your Aadhaar card for address verification
          </p>
        </div>

        <CameraCapture
          onCapture={handleCapture}
          capturedImage={documents.aadhaarBack}
          onRetake={handleRetake}
          documentType="aadhaar-back"
          instruction="Position your Aadhaar card back within the frame"
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

      {/* Address Details - shown after capture */}
      {documents.aadhaarBack && (
        <div className="form-section">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              Address Details
            </h3>
            <p className="text-sm text-muted-foreground">
              Fill in address details as per Aadhaar card
            </p>
          </div>

          <div className="space-y-4">
            {/* Full Address */}
            <div className="space-y-2" data-field="address">
              <Label htmlFor="address" className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Full Address <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="address"
                name="address"
                value={data.address}
                onChange={(e) => onUpdate({ address: e.target.value })}
                rows={3}
                className={errors.address ? 'border-destructive animate-shake' : ''}
                onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                autoComplete="street-address"
              />
              {errors.address && (
                <p className="text-xs text-destructive">{errors.address}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* PIN Code */}
              <div className="space-y-2" data-field="pinCode">
                <Label htmlFor="pinCode" className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-muted-foreground" />
                  PIN Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pinCode"
                  name="pinCode"
                  value={data.pinCode}
                  onChange={(e) => validatePinCode(e.target.value)}
                  placeholder="6-digit PIN"
                  inputMode="numeric"
                  className={errors.pinCode ? 'border-destructive animate-shake' : ''}
                  onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  autoComplete="postal-code"
                />
                {errors.pinCode && (
                  <p className="text-xs text-destructive">{errors.pinCode}</p>
                )}
              </div>

              {/* District */}
              <div className="space-y-2" data-field="district">
                <Label htmlFor="district" className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-muted-foreground" />
                  District <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="district"
                  name="district"
                  value={data.district}
                  onChange={(e) => onUpdate({ district: e.target.value })}
                  className={errors.district ? 'border-destructive animate-shake' : ''}
                  onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  autoComplete="address-level2"
                />
                {errors.district && (
                  <p className="text-xs text-destructive">{errors.district}</p>
                )}
              </div>
            </div>

            {/* State */}
            <div className="space-y-2" data-field="state">
              <Label htmlFor="state" className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                State <span className="text-destructive">*</span>
              </Label>
              <Select
                value={data.state}
                onValueChange={(value) => onUpdate({ state: value })}
              >
                <SelectTrigger id="state" className={errors.state ? 'border-destructive animate-shake' : ''}>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.state && (
                <p className="text-xs text-destructive">{errors.state}</p>
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
          disabled={!documents.aadhaarBack}
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
