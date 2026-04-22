import { useState, useEffect, useRef } from 'react';
import { ArrowRight, ArrowLeft, Heart, Mail, CreditCard, User, Calendar, Phone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AdditionalDetails, AadhaarDetails, MARITAL_STATUS_OPTIONS, BLOOD_GROUP_OPTIONS, RELATIONSHIP_OPTIONS } from '@/types/registration';
import { cn, scrollToError } from '@/lib/utils';
import { SplitDateInput } from '@/components/ui/date-input';

interface Step6Props {
  data: AdditionalDetails;
  aadhaarData: AadhaarDetails;
  onUpdate: (data: Partial<AdditionalDetails>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step6AdditionalDetails({
  data,
  aadhaarData,
  onUpdate,
  onNext,
  onBack,
}: Step6Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [useParentName, setUseParentName] = useState<'father' | 'husband' | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (useParentName && aadhaarData.fatherHusbandName) {
      onUpdate({ 
        nomineeName: aadhaarData.fatherHusbandName,
        nomineeRelationship: useParentName
      });
    }
  }, [useParentName, aadhaarData.fatherHusbandName, onUpdate]);

  const handleUseParentName = (type: 'father' | 'husband') => {
    if (useParentName === type) {
      setUseParentName(null);
      onUpdate({ nomineeName: '', nomineeRelationship: '' });
    } else {
      setUseParentName(type);
    }
  };

  const validateMobile = (value: string) => {
    return value.replace(/\D/g, '').slice(0, 10);
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};

    if (!data.maritalStatus) {
      newErrors.maritalStatus = 'Please select your marital status';
    }
    if (!data.nomineeName?.trim()) {
      newErrors.nomineeName = 'Nominee name is required';
    }
    if (!data.nomineeRelationship) {
      newErrors.nomineeRelationship = 'Please specify nominee relationship';
    }
    if (!data.nomineeDob) {
      newErrors.nomineeDob = 'Nominee date of birth is required';
    }
    if (!data.nomineeContact || data.nomineeContact.length !== 10) {
      newErrors.nomineeContact = 'Please enter a valid 10-digit mobile number';
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (data.uanNumber && data.uanNumber.length !== 12) {
      newErrors.uanNumber = 'UAN number must be exactly 12 digits';
    }
    if (data.esicNumber && data.esicNumber.length !== 10) {
      newErrors.esicNumber = 'ESIC number must be exactly 10 digits';
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
            Additional Details
          </h2>
          <p className="text-sm text-muted-foreground">
            Please provide the following information to complete your registration
          </p>
        </div>

        {/* Success Banner */}
        <div className="p-4 bg-success/10 rounded-xl mb-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-success" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Bank Verification Successful
              </p>
              <p className="text-xs text-muted-foreground">
                Now please complete a few more details
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* Marital Status */}
          <div className="space-y-2" data-field="maritalStatus">
            <Label htmlFor="maritalStatus" className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-muted-foreground" />
              Marital Status <span className="text-destructive">*</span>
            </Label>
            <Select
              value={data.maritalStatus}
              onValueChange={(value) => onUpdate({ maritalStatus: value as AdditionalDetails['maritalStatus'] })}
            >
              <SelectTrigger id="maritalStatus" className={cn(errors.maritalStatus && 'border-destructive animate-shake')}>
                <SelectValue placeholder="Select marital status" />
              </SelectTrigger>
              <SelectContent>
                {MARITAL_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.maritalStatus && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.maritalStatus}
              </p>
            )}
          </div>

          {/* Blood Group */}
          <div className="space-y-2">
            <Label htmlFor="bloodGroup" className="flex items-center gap-2">
              Blood Group
              <span className="text-xs text-muted-foreground">(Optional)</span>
            </Label>
            <Select
              value={data.bloodGroup || ''}
              onValueChange={(value) => onUpdate({ bloodGroup: value })}
            >
              <SelectTrigger id="bloodGroup">
                <SelectValue placeholder="Select if known" />
              </SelectTrigger>
              <SelectContent>
                {BLOOD_GROUP_OPTIONS.map((option) => (
                  <SelectItem key={option.value || 'none'} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Email */}
          <div className="space-y-2" data-field="email">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              Email ID
              <span className="text-xs text-muted-foreground">(Optional)</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={data.email}
              onChange={(e) => onUpdate({ email: e.target.value })}
              placeholder="your.email@example.com"
              className={cn(errors.email && 'border-destructive animate-shake')}
              onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              autoComplete="email"
            />
            {errors.email && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.email}
              </p>
            )}
          </div>

          {/* UAN Number */}
          <div className="space-y-2" data-field="uanNumber">
            <Label htmlFor="uanNumber" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              UAN Number
              <span className="text-xs text-muted-foreground">(Optional - 12 digits)</span>
            </Label>
            <Input
              id="uanNumber"
              name="uanNumber"
              type="text"
              inputMode="numeric"
              value={data.uanNumber}
              onChange={(e) => onUpdate({ uanNumber: e.target.value.replace(/\D/g, '').slice(0, 12) })}
              placeholder="12-digit UAN"
              maxLength={12}
              className={cn(errors.uanNumber && 'border-destructive animate-shake')}
              onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              autoComplete="off"
            />
            {errors.uanNumber && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.uanNumber}
              </p>
            )}
          </div>

          {/* ESIC Number */}
          <div className="space-y-2" data-field="esicNumber">
            <Label htmlFor="esicNumber" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              ESIC Number
              <span className="text-xs text-muted-foreground">(Optional - 10 digits)</span>
            </Label>
            <Input
              id="esicNumber"
              name="esicNumber"
              type="text"
              inputMode="numeric"
              value={data.esicNumber}
              onChange={(e) => onUpdate({ esicNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              placeholder="10-digit ESIC"
              maxLength={10}
              className={cn(errors.esicNumber && 'border-destructive animate-shake')}
              onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              autoComplete="off"
            />
            {errors.esicNumber && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.esicNumber}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Nominee Details Section */}
      <div className="form-section">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground mb-1">
            Nominee Details
          </h3>
          <p className="text-sm text-muted-foreground">
            Please provide your nominee information (mandatory)
          </p>
        </div>

        <div className="space-y-5">
          {/* Auto-fill options */}
          {aadhaarData.fatherHusbandName && (
            <div className="p-4 bg-muted/50 rounded-xl space-y-3">
              <p className="text-sm font-medium text-foreground">
                Quick fill from Aadhaar:
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use-father"
                    checked={useParentName === 'father'}
                    onCheckedChange={() => handleUseParentName('father')}
                  />
                  <label htmlFor="use-father" className="text-sm font-medium leading-none cursor-pointer">
                    Father: {aadhaarData.fatherHusbandName}
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use-husband"
                    checked={useParentName === 'husband'}
                    onCheckedChange={() => handleUseParentName('husband')}
                  />
                  <label htmlFor="use-husband" className="text-sm font-medium leading-none cursor-pointer">
                    Husband: {aadhaarData.fatherHusbandName}
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Nominee Name */}
          <div className="space-y-2" data-field="nomineeName">
            <Label htmlFor="nomineeName" className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              Nominee Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nomineeName"
              name="nomineeName"
              type="text"
              value={data.nomineeName}
              onChange={(e) => {
                setUseParentName(null);
                onUpdate({ nomineeName: e.target.value });
              }}
              placeholder="Enter nominee's full name"
              className={cn(errors.nomineeName && 'border-destructive animate-shake')}
              onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              autoComplete="name"
            />
            {errors.nomineeName && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.nomineeName}
              </p>
            )}
          </div>

          {/* Nominee Relationship */}
          <div className="space-y-2" data-field="nomineeRelationship">
            <Label htmlFor="nomineeRelationship">
              Relationship <span className="text-destructive">*</span>
            </Label>
            <Select
              value={data.nomineeRelationship}
              onValueChange={(value) => onUpdate({ nomineeRelationship: value as AdditionalDetails['nomineeRelationship'] })}
            >
              <SelectTrigger id="nomineeRelationship" className={cn(errors.nomineeRelationship && 'border-destructive animate-shake')}>
                <SelectValue placeholder="Select relationship" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.nomineeRelationship && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.nomineeRelationship}
              </p>
            )}
          </div>

          {/* Nominee DOB - Split Input for fast mobile entry */}
          <div data-field="nomineeDob">
            <SplitDateInput
              label="Nominee Date of Birth"
              value={data.nomineeDob}
              onChange={(value) => onUpdate({ nomineeDob: value })}
              required
              error={errors.nomineeDob}
              maxYear={new Date().getFullYear()}
              minYear={1940}
            />
          </div>

          {/* Emergency/Nominee Contact */}
          <div className="space-y-2" data-field="nomineeContact">
            <Label htmlFor="nomineeContact" className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              Emergency/Nominee Contact Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nomineeContact"
              name="nomineeContact"
              type="tel"
              inputMode="numeric"
              value={data.nomineeContact}
              onChange={(e) => onUpdate({ nomineeContact: validateMobile(e.target.value) })}
              placeholder="10-digit mobile number"
              maxLength={10}
              className={cn(errors.nomineeContact && 'border-destructive animate-shake')}
              onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              autoComplete="tel"
            />
            {errors.nomineeContact && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.nomineeContact}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={handleSubmit} className="flex-1">
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
