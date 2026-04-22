import { useState } from 'react';
import { ArrowLeft, Check, User, CreditCard, Building2, MapPin, Phone, Mail, Calendar, Users, FileCheck, Loader2, CheckCircle2, Download, MessageCircle, AlertTriangle, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RegistrationData, RELATIONSHIP_OPTIONS } from '@/types/registration';
import { cn, formatDateDDMMYYYY } from '@/lib/utils';
import { generateRegistrationPDF } from '@/lib/pdf/generateRegistrationPDF';
import { toast } from 'sonner';
import { getFileUrl } from '@/lib/api/config';
import { SuccessPage } from '@/components/registration/SuccessPage';

interface Step8Props {
  data: RegistrationData;
  onBack: () => void;
  onSubmit: () => void;
  onComplete?: () => void;
}

export function Step8Review({
  data,
  onBack,
  onSubmit,
  onComplete,
}: Step8Props) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Debug: Log profile pic data
  console.log('Step8Review - documents:', data.documents);
  console.log('Step8Review - profilePic:', data.documents.profilePic);

  // Check for missing/empty required fields
  const getMissingFields = () => {
    const missing: string[] = [];
    
    // Personal details
    if (!data.aadhaarDetails.fullName) missing.push('Full Name');
    if (!data.aadhaarDetails.fatherHusbandName) missing.push('Father/Husband Name');
    if (!data.aadhaarDetails.dateOfBirth) missing.push('Date of Birth');
    if (!data.aadhaarDetails.gender) missing.push('Gender');
    if (!data.aadhaarDetails.aadhaarNumber) missing.push('Aadhaar Number');
    
    // Address
    if (!data.aadhaarDetails.address) missing.push('Address');
    if (!data.aadhaarDetails.pinCode) missing.push('PIN Code');
    if (!data.aadhaarDetails.state) missing.push('State');
    if (!data.aadhaarDetails.district) missing.push('District');
    
    // Bank details
    if (!data.bankDetails.bankName) missing.push('Bank Name');
    if (!data.bankDetails.accountNumber) missing.push('Account Number');
    if (!data.bankDetails.ifscCode) missing.push('IFSC Code');
    if (!data.bankDetails.accountHolderName) missing.push('Account Holder Name');
    
    // Additional details
    if (!data.additionalDetails.maritalStatus) missing.push('Marital Status');
    if (!data.additionalDetails.nomineeName) missing.push('Nominee Name');
    if (!data.additionalDetails.nomineeRelationship) missing.push('Nominee Relationship');
    if (!data.additionalDetails.nomineeDob) missing.push('Nominee DOB');
    if (!data.additionalDetails.nomineeContact) missing.push('Nominee Contact');
    
    // Client/Unit
    if (!data.clientUnitInfo.clientName) missing.push('Client');
    if (!data.clientUnitInfo.unitName) missing.push('Unit/Location');
    
    // Documents
    if (!data.documents.profilePic) missing.push('Profile Photo');
    if (!data.documents.aadhaarFront) missing.push('Aadhaar Front');
    if (!data.documents.aadhaarBack) missing.push('Aadhaar Back');
    if (!data.documents.bankDocument) missing.push('Bank Document');
    
    return missing;
  };

  const missingFields = getMissingFields();
  const hasMissingFields = missingFields.length > 0;

  const buildWhatsAppUrl = () => {
    const name = data.aadhaarDetails.fullName || 'Employee';
    const client = data.clientUnitInfo.clientName || '';
    const unit = data.clientUnitInfo.unitName || '';
    const mobile = data.basicInfo.mobileNumber || '';
    const aadhaar = data.aadhaarDetails.aadhaarNumber || '';
    const bank = data.bankDetails.bankName || '';
    const accNo = data.bankDetails.accountNumber || '';
    const ifsc = data.bankDetails.ifscCode || '';
    const dob = data.aadhaarDetails.dateOfBirth || '';
    const father = data.aadhaarDetails.fatherHusbandName || '';
    const nominee = data.additionalDetails.nomineeName || '';
    const nomineeRel = getRelationshipLabel(data.additionalDetails.nomineeRelationship);

    const message = encodeURIComponent(
      `Dear Madam,\n\nI ${name} am working at ${client} - ${unit}.\n\nMy Details:\n📱 Mobile: ${mobile}\n📋 Aadhaar: ${aadhaar}\n🎂 DOB: ${formatDate(dob)}\n👨 Father/Husband: ${father}\n🏦 Bank: ${bank}\n💳 Account: ${accNo}\n🔢 IFSC: ${ifsc}\n👤 Nominee: ${nominee} (${nomineeRel})\n\nRequesting you to approve my employee registration form.\n\nThank you.`
    );
    const phoneNumber = '918469241414';
    return `https://wa.me/${phoneNumber}?text=${message}`;
  };

  const handleSubmit = async () => {
    if (!isConfirmed) return;
    
    setIsSubmitting(true);
    
    try {
      await onSubmit();
      setIsSubmitted(true);
      // SuccessPage handles WhatsApp redirect automatically
    } catch (error) {
      console.error('Submission error:', error);
      toast.error('Failed to submit registration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatMaritalStatus = (status: string) => {
    if (!status) return '';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatGender = (gender: string) => {
    if (!gender) return '';
    return gender.charAt(0).toUpperCase() + gender.slice(1);
  };

  const getRelationshipLabel = (value: string) => {
    if (!value) return '';
    const option = RELATIONSHIP_OPTIONS.find(opt => opt.value === value);
    return option ? option.label : value.charAt(0).toUpperCase() + value.slice(1);
  };

  // Use the imported formatDateDDMMYYYY utility
  const formatDate = formatDateDDMMYYYY;

  // Show full-screen success page after submission
  if (isSubmitted) {
    return <SuccessPage data={data} onComplete={onComplete} />;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Missing Fields Warning */}
      {hasMissingFields && (
        <div className="form-section bg-warning/10 border border-warning/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">
                Missing Required Information
              </p>
              <p className="text-xs text-muted-foreground mb-2">
                The following fields are missing. Please go back and complete them:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingFields.map((field, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning/20 text-warning"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Header */}
      <div className="form-section">
        <div className="flex items-center gap-4 mb-6">
          {data.documents.profilePic ? (
            <div className="w-20 h-20 rounded-full overflow-hidden bg-muted border-2 border-primary/20 shadow-lg">
              <img src={getFileUrl(data.documents.profilePic) || undefined} alt="Profile" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
              <User className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {data.aadhaarDetails.fullName || 'Employee Name'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Aadhaar: {data.aadhaarDetails.aadhaarNumber || 'Not provided'}
            </p>
            {data.aadhaarDetails.fatherHusbandName && (
              <p className="text-sm text-muted-foreground">
                Father/Husband: {data.aadhaarDetails.fatherHusbandName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Personal Details */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Personal Details
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Date of Birth</span>
            <p className="font-medium">{formatDate(data.aadhaarDetails.dateOfBirth) || '-'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Gender</span>
            <p className="font-medium">{formatGender(data.aadhaarDetails.gender) || '-'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Marital Status</span>
            <p className="font-medium">{formatMaritalStatus(data.additionalDetails.maritalStatus) || '-'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Mobile</span>
            <p className="font-medium">+91 {data.basicInfo.mobileNumber || '-'}</p>
          </div>
          {data.additionalDetails.bloodGroup && data.additionalDetails.bloodGroup !== 'not_known' && (
            <div>
              <span className="text-muted-foreground">Blood Group</span>
              <p className="font-medium">{data.additionalDetails.bloodGroup}</p>
            </div>
          )}
          {data.additionalDetails.email && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Email</span>
              <p className="font-medium">{data.additionalDetails.email}</p>
            </div>
          )}
        </div>
      </div>

      {/* Address */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Address
        </h3>
        <div className="text-sm space-y-2">
          <p className="font-medium">{data.aadhaarDetails.address || '-'}</p>
          <p className="text-muted-foreground">
            {data.aadhaarDetails.district || '-'}, {data.aadhaarDetails.state || '-'} - {data.aadhaarDetails.pinCode || '-'}
          </p>
        </div>
      </div>

      {/* Bank Details */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Bank Details
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Bank Name</span>
            <p className="font-medium">{data.bankDetails.bankName || '-'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">IFSC Code</span>
            <p className="font-medium">{data.bankDetails.ifscCode || '-'}</p>
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground">Account Number</span>
            <p className="font-medium">{data.bankDetails.accountNumber || '-'}</p>
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground">Account Holder</span>
            <p className="font-medium">{data.bankDetails.accountHolderName || '-'}</p>
          </div>
        </div>
        <div className="mt-3">
          <span className="verification-badge verification-success">
            <Check className="w-3 h-3" />
            Verified
          </span>
        </div>
      </div>

      {/* Client & Unit */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Assignment Details
        </h3>
        <div className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Client</span>
            <span className="font-medium">{data.clientUnitInfo.clientName || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Location</span>
            <span className="font-medium">{data.clientUnitInfo.unitName || '-'}</span>
          </div>
          {data.clientUnitInfo.designation && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Designation</span>
              <span className="font-medium">{data.clientUnitInfo.designation}</span>
            </div>
          )}
        </div>
      </div>

      {/* Nominee Details */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Nominee Details
        </h3>
        <div className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nominee Name</span>
            <span className="font-medium">{data.additionalDetails.nomineeName || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Relationship</span>
            <span className="font-medium">{getRelationshipLabel(data.additionalDetails.nomineeRelationship) || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nominee DOB</span>
            <span className="font-medium">{formatDate(data.additionalDetails.nomineeDob) || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nominee Contact</span>
            <span className="font-medium">+91 {data.additionalDetails.nomineeContact || '-'}</span>
          </div>
        </div>
      </div>

      {/* ID Numbers */}
      {(data.additionalDetails.uanNumber || data.additionalDetails.esicNumber) && (
        <div className="form-section">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            ID Numbers
          </h3>
          <div className="text-sm space-y-2">
            {data.additionalDetails.uanNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">UAN Number</span>
                <span className="font-medium">{data.additionalDetails.uanNumber}</span>
              </div>
            )}
            {data.additionalDetails.esicNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">ESIC Number</span>
                <span className="font-medium">{data.additionalDetails.esicNumber}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document Thumbnails */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-primary" />
          Uploaded Documents
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {data.documents.profilePic ? (
            <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted border border-border">
              <img src={getFileUrl(data.documents.profilePic) || undefined} alt="Profile" className="w-full h-full object-cover" />
              <p className="text-xs text-center text-muted-foreground mt-1">Profile</p>
            </div>
          ) : (
            <div className="aspect-[3/4] rounded-lg bg-muted border border-dashed border-muted-foreground/30 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">No Profile</span>
            </div>
          )}
          {data.documents.aadhaarFront ? (
            <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted border border-border">
              <img src={getFileUrl(data.documents.aadhaarFront) || undefined} alt="Aadhaar Front" className="w-full h-full object-cover" />
              <p className="text-xs text-center text-muted-foreground mt-1">Aadhaar Front</p>
            </div>
          ) : (
            <div className="aspect-[3/4] rounded-lg bg-muted border border-dashed border-muted-foreground/30 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">No Aadhaar Front</span>
            </div>
          )}
          {data.documents.aadhaarBack ? (
            <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted border border-border">
              <img src={getFileUrl(data.documents.aadhaarBack) || undefined} alt="Aadhaar Back" className="w-full h-full object-cover" />
              <p className="text-xs text-center text-muted-foreground mt-1">Aadhaar Back</p>
            </div>
          ) : (
            <div className="aspect-[3/4] rounded-lg bg-muted border border-dashed border-muted-foreground/30 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">No Aadhaar Back</span>
            </div>
          )}
          {data.documents.bankDocument ? (
            <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted border border-border">
              <img src={getFileUrl(data.documents.bankDocument) || undefined} alt="Bank Document" className="w-full h-full object-cover" />
              <p className="text-xs text-center text-muted-foreground mt-1">Bank Doc</p>
            </div>
          ) : (
            <div className="aspect-[3/4] rounded-lg bg-muted border border-dashed border-muted-foreground/30 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">No Bank Doc</span>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation */}
      <div className="form-section">
        <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-xl border border-primary/20">
          <Checkbox
            id="confirm"
            checked={isConfirmed}
            onCheckedChange={(checked) => setIsConfirmed(checked as boolean)}
          />
          <Label htmlFor="confirm" className="text-sm leading-relaxed cursor-pointer">
            I confirm that the above details are correct to the best of my knowledge. 
            I understand that providing false information may lead to rejection of my registration.
          </Label>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1" disabled={isSubmitting}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1"
          disabled={!isConfirmed || isSubmitting || hasMissingFields}
          variant="success"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Submit Registration
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
