import { useState, useRef } from 'react';
import { ArrowRight, ArrowLeft, User, Calendar, Users, CreditCard, Loader2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CameraCapture } from '@/components/registration/CameraCapture';
import { SplitDateInput } from '@/components/ui/date-input';
import { AadhaarDetails, DocumentImages } from '@/types/registration';
import { toast } from 'sonner';
import { scrollToError } from '@/lib/utils';
import { uploadBase64Image } from '@/lib/api/config';
import { getFileUrl } from '@/lib/api/config';

interface Step2Props {
  data: AadhaarDetails;
  documents: DocumentImages;
  onUpdate: (data: Partial<AadhaarDetails>) => void;
  onUpdateDocuments: (data: Partial<DocumentImages>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2AadhaarFront({
  data,
  documents,
  onUpdate,
  onUpdateDocuments,
  onNext,
  onBack,
}: Step2Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const handleCapture = async (imageData: string) => {
    setIsUploading(true);
    try {
      const { url, error } = await uploadBase64Image(imageData, 'aadhaar-front.jpg', 'aadhaar');
      if (error || !url) {
        toast.error(error || 'Upload failed. Please try again.');
        setIsUploading(false);
        return;
      }
      onUpdateDocuments({ aadhaarFront: url });
      toast.success('Document uploaded. Please fill in the details.');
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetake = () => {
    onUpdateDocuments({ aadhaarFront: null });
  };

  const handleProfileCapture = async (imageData: string) => {
    setIsUploadingProfile(true);
    try {
      const { url, error } = await uploadBase64Image(imageData, 'profile.jpg', 'profile');
      if (error || !url) {
        toast.error(error || 'Upload failed. Please try again.');
        setIsUploadingProfile(false);
        return;
      }
      onUpdateDocuments({ profilePic: url });
      toast.success('Profile photo uploaded.');
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setIsUploadingProfile(false);
    }
  };

  const handleProfileRetake = () => {
    onUpdateDocuments({ profilePic: null });
  };

  const formatAadhaar = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const limited = cleaned.slice(0, 12);
    const formatted = limited.replace(/(\d{4})(?=\d)/g, '$1 ');
    return formatted;
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};

    if (!documents.profilePic) {
      newErrors.profilePic = 'Please capture your profile photo';
    }
    if (!documents.aadhaarFront) {
      newErrors.document = 'Please scan your Aadhaar card front';
    }
    if (!data.fullName) {
      newErrors.fullName = 'Name is required';
    }
    if (!data.fatherHusbandName) {
      newErrors.fatherHusbandName = 'Father/Husband name is required';
    }
    if (!data.dateOfBirth) {
      newErrors.dateOfBirth = 'Date of birth is required';
    }
    if (!data.gender) {
      newErrors.gender = 'Gender is required';
    }
    if (data.aadhaarNumber.replace(/\s/g, '').length !== 12) {
      newErrors.aadhaarNumber = 'Valid 12-digit Aadhaar number required';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const firstErrorKey = Object.keys(newErrors)[0];
      scrollToError(firstErrorKey, formRef.current);
      return;
    }
    onNext();
  };

  return (
    <div className="space-y-6 animate-slide-up" ref={formRef}>
      {/* Profile Photo Section */}
      <div className="form-section">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-foreground mb-2 flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Profile Photo
          </h2>
          <p className="text-sm text-muted-foreground">
            Take a clear photo of your face for the ID card
          </p>
        </div>

        <CameraCapture
          onCapture={handleProfileCapture}
          capturedImage={documents.profilePic}
          onRetake={handleProfileRetake}
          documentType="profile"
          instruction="Position your face within the frame"
        />

        {isUploadingProfile && (
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading photo...
          </div>
        )}

        {errors.profilePic && (
          <p className="text-xs text-destructive mt-2" data-error="profilePic">{errors.profilePic}</p>
        )}
      </div>

      {/* Aadhaar Front Section */}
      <div className="form-section">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Aadhaar Card - Front Side
          </h2>
          <p className="text-sm text-muted-foreground">
            Scan the front side of your Aadhaar card clearly
          </p>
        </div>

        <CameraCapture
          onCapture={handleCapture}
          capturedImage={documents.aadhaarFront}
          onRetake={handleRetake}
          documentType="aadhaar-front"
          instruction="Position your Aadhaar card front within the frame"
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

      {/* Details Form - shown after capture */}
      {documents.aadhaarFront && (
        <div className="form-section">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              Personal Details
            </h3>
            <p className="text-sm text-muted-foreground">
              Please fill in your details as per Aadhaar card
            </p>
          </div>

          <div className="space-y-4">
            {/* Full Name */}
            <div className="space-y-2" data-field="fullName">
              <Label htmlFor="fullName" className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Full Name (as per Aadhaar) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fullName"
                name="fullName"
                value={data.fullName}
                onChange={(e) => onUpdate({ fullName: e.target.value })}
                className={errors.fullName ? 'border-destructive animate-shake' : ''}
                onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                autoComplete="name"
              />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName}</p>
              )}
            </div>

            {/* Father/Husband Name */}
            <div className="space-y-2" data-field="fatherHusbandName">
              <Label htmlFor="fatherHusbandName" className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Father / Husband Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fatherHusbandName"
                name="fatherHusbandName"
                value={data.fatherHusbandName}
                onChange={(e) => onUpdate({ fatherHusbandName: e.target.value })}
                placeholder="Enter father or husband name"
                className={errors.fatherHusbandName ? 'border-destructive animate-shake' : ''}
                onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                autoComplete="name"
              />
              {errors.fatherHusbandName && (
                <p className="text-xs text-destructive">{errors.fatherHusbandName}</p>
              )}
            </div>

            {/* Date of Birth - Split Input for fast mobile entry */}
            <div data-field="dateOfBirth">
              <SplitDateInput
                label="Date of Birth"
                value={data.dateOfBirth}
                onChange={(value) => onUpdate({ dateOfBirth: value })}
                required
                error={errors.dateOfBirth}
                maxYear={new Date().getFullYear() - 14} // Min 14 years old
                minYear={1950}
              />
            </div>

            {/* Gender */}
            <div className="space-y-2" data-field="gender">
              <Label htmlFor="gender" className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Gender <span className="text-destructive">*</span>
              </Label>
              <Select
                value={data.gender}
                onValueChange={(value) => onUpdate({ gender: value as AadhaarDetails['gender'] })}
              >
                <SelectTrigger id="gender" className={errors.gender ? 'border-destructive animate-shake' : ''}>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.gender && (
                <p className="text-xs text-destructive">{errors.gender}</p>
              )}
            </div>

            {/* Aadhaar Number */}
            <div className="space-y-2" data-field="aadhaarNumber">
              <Label htmlFor="aadhaarNumber" className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                Aadhaar Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="aadhaarNumber"
                name="aadhaarNumber"
                value={data.aadhaarNumber}
                onChange={(e) => onUpdate({ aadhaarNumber: formatAadhaar(e.target.value) })}
                placeholder="XXXX XXXX XXXX"
                inputMode="numeric"
                className={errors.aadhaarNumber ? 'border-destructive animate-shake' : ''}
                onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                autoComplete="off"
              />
              {errors.aadhaarNumber && (
                <p className="text-xs text-destructive">{errors.aadhaarNumber}</p>
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
          disabled={!documents.aadhaarFront || !documents.profilePic}
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
