import { useState, useCallback, useEffect, useRef } from 'react';
import { StepIndicator } from './StepIndicator';
import { ProfileCompletion } from './ProfileCompletion';
import { Step2AadhaarFront } from './steps/Step2AadhaarFront';
import { Step3AadhaarBack } from './steps/Step3AadhaarBack';
import { Step4BankDocument } from './steps/Step4BankDocument';
import { Step5BankVerification } from './steps/Step5BankVerification';
import { Step6AdditionalDetails } from './steps/Step6AdditionalDetails';
import { Step7ClientUnit } from './steps/Step7ClientUnit';
import { Step8Review } from './steps/Step8Review';
import { createEmployee, updateEmployee } from '@/lib/api/employees';
import type { 
  RegistrationStep, 
  RegistrationData, 
  BasicInfo, 
  AadhaarDetails, 
  BankDetails, 
  AdditionalDetails,
  ClientUnitInfo,
  DocumentImages 
} from '@/types/registration';

// LocalStorage key for form data persistence
const REGISTRATION_DATA_KEY = 'registration_form_data';
const REGISTRATION_STEP_KEY = 'registration_current_step';
const REGISTRATION_COMPLETED_KEY = 'registration_completed_steps';

interface RegistrationWizardProps {
  initialMobile?: string;
  initialProfilePic?: string;
  existingEmployeeId?: string;
  existingEmployee?: {
    full_name?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    aadhaar_number?: string | null;
    address?: string | null;
    pin_code?: string | null;
    state?: string | null;
    district?: string | null;
    bank_name?: string | null;
    account_number?: string | null;
    ifsc_code?: string | null;
    account_holder_name?: string | null;
    email?: string | null;
    uan_number?: string | null;
    esic_number?: string | null;
    marital_status?: string | null;
    blood_group?: string | null;
    nominee_name?: string | null;
    nominee_relationship?: string | null;
    nominee_dob?: string | null;
    nominee_contact?: string | null;
    client_name?: string | null;
    unit_name?: string | null;
    client_id?: string | null;
    unit_id?: string | null;
    designation?: string | null;
    profile_pic_url?: string | null;
    aadhaar_front_url?: string | null;
    aadhaar_back_url?: string | null;
    bank_document_url?: string | null;
  } | null;
  onComplete: () => void;
  onBack?: () => void;
}

const createInitialData = (
  mobile?: string, 
  emp?: RegistrationWizardProps['existingEmployee'],
  profilePic?: string
): RegistrationData => {
  console.log('createInitialData - profilePic param:', profilePic);
  console.log('createInitialData - emp?.profile_pic_url:', emp?.profile_pic_url);
  
  return {
  basicInfo: {
    mobileNumber: mobile || '',
  },
  aadhaarDetails: {
    fullName: emp?.full_name || '',
    fatherHusbandName: '',
    dateOfBirth: emp?.date_of_birth || '',
    gender: (emp?.gender as AadhaarDetails['gender']) || '',
    aadhaarNumber: emp?.aadhaar_number || '',
    address: emp?.address || '',
    pinCode: emp?.pin_code || '',
    state: emp?.state || '',
    district: emp?.district || '',
  },
  bankDetails: {
    bankName: emp?.bank_name || '',
    accountNumber: emp?.account_number || '',
    ifscCode: emp?.ifsc_code || '',
    accountHolderName: emp?.account_holder_name || '',
    confirmAccountNumber: emp?.account_number || '',
  },
  additionalDetails: {
    maritalStatus: (emp?.marital_status as AdditionalDetails['maritalStatus']) || '',
    bloodGroup: emp?.blood_group || '',
    email: emp?.email || '',
    uanNumber: emp?.uan_number || '',
    esicNumber: emp?.esic_number || '',
    nomineeName: emp?.nominee_name || '',
    nomineeRelationship: (emp?.nominee_relationship as AdditionalDetails['nomineeRelationship']) || '',
    nomineeDob: emp?.nominee_dob || '',
    nomineeContact: emp?.nominee_contact || '',
  },
  clientUnitInfo: {
    clientId: emp?.client_id || null,
    clientName: emp?.client_name || '',
    unitId: emp?.unit_id || null,
    unitName: emp?.unit_name || '',
    designation: emp?.designation || '',
  },
  documents: {
    aadhaarFront: emp?.aadhaar_front_url || null,
    aadhaarBack: emp?.aadhaar_back_url || null,
    bankDocument: emp?.bank_document_url || null,
    profilePic: profilePic || emp?.profile_pic_url || null,
  },
};
}

export function RegistrationWizard({ 
  initialMobile, 
  initialProfilePic,
  existingEmployeeId, 
  existingEmployee, 
  onComplete, 
  onBack: onBackToMobile 
}: RegistrationWizardProps) {
  // Debug: Log initial profile pic
  console.log('=== RegistrationWizard render ===');
  console.log('initialMobile:', initialMobile);
  console.log('initialProfilePic prop:', initialProfilePic);
  console.log('existingEmployeeId:', existingEmployeeId);
  
  // Check localStorage for profile pic as backup
  const localStorageProfilePic = typeof window !== 'undefined' 
    ? localStorage.getItem('registration_profile_pic') 
    : null;
  console.log('localStorage profilePic:', localStorageProfilePic);
  
  // Use localStorage value if prop is undefined
  const effectiveProfilePic = initialProfilePic || localStorageProfilePic || undefined;
  console.log('effectiveProfilePic:', effectiveProfilePic);
  
  // Track if we've restored from localStorage to prevent overwriting
  const hasRestoredRef = useRef(false);
  
  // Function to load saved form data from localStorage
  const loadSavedFormData = (): { data: RegistrationData | null; step: RegistrationStep | null; completedSteps: number[] | null } => {
    try {
      const savedData = localStorage.getItem(REGISTRATION_DATA_KEY);
      const savedStep = localStorage.getItem(REGISTRATION_STEP_KEY);
      const savedCompleted = localStorage.getItem(REGISTRATION_COMPLETED_KEY);
      
      return {
        data: savedData ? JSON.parse(savedData) : null,
        step: savedStep ? (parseInt(savedStep) as RegistrationStep) : null,
        completedSteps: savedCompleted ? JSON.parse(savedCompleted) : null,
      };
    } catch (e) {
      console.error('Error loading saved form data:', e);
      return { data: null, step: null, completedSteps: null };
    }
  };
  
  // Determine which step to start on based on existing data or saved data
  const getStartStep = (): RegistrationStep => {
    // First check if we have saved progress
    const saved = loadSavedFormData();
    if (saved.step && saved.data) {
      console.log('Found saved progress, restoring step:', saved.step);
      return saved.step;
    }
    
    if (!existingEmployee) return 2;
    // Check if profile photo is missing - need to capture it
    if (!existingEmployee.profile_pic_url && !effectiveProfilePic) return 2;
    // Find first step with missing data
    if (!existingEmployee.aadhaar_front_url || !existingEmployee.full_name || !existingEmployee.aadhaar_number) return 2;
    if (!existingEmployee.aadhaar_back_url || !existingEmployee.address) return 3;
    if (!existingEmployee.bank_document_url || !existingEmployee.bank_name || !existingEmployee.account_number) return 4;
    if (!existingEmployee.ifsc_code) return 5;
    if (!existingEmployee.nominee_name || !existingEmployee.marital_status) return 6;
    if (!existingEmployee.client_name || !existingEmployee.unit_name) return 7;
    return 8; // All filled, go to review
  };

  const startStep = getStartStep();
  const [currentStep, setCurrentStep] = useState<RegistrationStep>(startStep);
  
  // Mark earlier steps as completed if we're starting ahead
  const getInitialCompletedSteps = (): Set<number> => {
    const saved = loadSavedFormData();
    if (saved.completedSteps && saved.completedSteps.length > 0) {
      return new Set(saved.completedSteps);
    }
    
    const initialCompleted = new Set<number>([1]);
    for (let i = 2; i < startStep; i++) initialCompleted.add(i);
    return initialCompleted;
  };
  
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(getInitialCompletedSteps);
  
  // Initialize data - either from localStorage, existing employee, or fresh
  const [data, setData] = useState<RegistrationData>(() => {
    // Try to restore from localStorage first
    const saved = loadSavedFormData();
    if (saved.data && !existingEmployee) {
      console.log('=== Restoring registration data from localStorage ===');
      hasRestoredRef.current = true;
      return saved.data;
    }
    
    const initialData = createInitialData(initialMobile, existingEmployee, effectiveProfilePic);
    console.log('=== Initial registration data created ===');
    console.log('documents.profilePic:', initialData.documents.profilePic);
    return initialData;
  });

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    // Skip saving if we just restored from localStorage
    if (hasRestoredRef.current) {
      hasRestoredRef.current = false;
      return;
    }
    
    // Only save if we have meaningful data (not just empty initial state)
    const hasData = data.aadhaarDetails.fullName || 
                    data.aadhaarDetails.aadhaarNumber || 
                    data.bankDetails.accountNumber ||
                    data.documents.profilePic ||
                    data.documents.aadhaarFront;
    
    if (hasData) {
      console.log('=== Saving form data to localStorage ===');
      localStorage.setItem(REGISTRATION_DATA_KEY, JSON.stringify(data));
    }
  }, [data]);
  
  // Save current step to localStorage
  useEffect(() => {
    localStorage.setItem(REGISTRATION_STEP_KEY, currentStep.toString());
  }, [currentStep]);
  
  // Save completed steps to localStorage
  useEffect(() => {
    localStorage.setItem(REGISTRATION_COMPLETED_KEY, JSON.stringify([...completedSteps]));
  }, [completedSteps]);

  // Update profilePic when initialProfilePic prop changes (e.g., after photo capture)
  useEffect(() => {
    // Only update if we have a new profilePic and it's different from current
    setData(prev => {
      if (initialProfilePic && prev.documents.profilePic !== initialProfilePic) {
        console.log('useEffect - updating profilePic from prop:', initialProfilePic);
        return {
          ...prev,
          documents: { ...prev.documents, profilePic: initialProfilePic },
        };
      }
      return prev;
    });
  }, [initialProfilePic]);

  const updateBasicInfo = useCallback((updates: Partial<BasicInfo>) => {
    setData(prev => ({
      ...prev,
      basicInfo: { ...prev.basicInfo, ...updates },
    }));
  }, []);

  const updateAadhaarDetails = useCallback((updates: Partial<AadhaarDetails>) => {
    setData(prev => ({
      ...prev,
      aadhaarDetails: { ...prev.aadhaarDetails, ...updates },
    }));
  }, []);

  const updateBankDetails = useCallback((updates: Partial<BankDetails>) => {
    setData(prev => ({
      ...prev,
      bankDetails: { ...prev.bankDetails, ...updates },
    }));
  }, []);

  const updateAdditionalDetails = useCallback((updates: Partial<AdditionalDetails>) => {
    setData(prev => ({
      ...prev,
      additionalDetails: { ...prev.additionalDetails, ...updates },
    }));
  }, []);

  const updateClientUnitInfo = useCallback((updates: Partial<ClientUnitInfo>) => {
    setData(prev => ({
      ...prev,
      clientUnitInfo: { ...prev.clientUnitInfo, ...updates },
    }));
  }, []);

  const updateDocuments = useCallback((updates: Partial<DocumentImages>) => {
    setData(prev => ({
      ...prev,
      documents: { ...prev.documents, ...updates },
    }));
  }, []);

  const goToNextStep = useCallback(() => {
    setCompletedSteps(prev => new Set(prev).add(currentStep));
    setCurrentStep(prev => Math.min(prev + 1, 8) as RegistrationStep);
  }, [currentStep]);

  const goToPreviousStep = useCallback(() => {
    if (currentStep === 2 && onBackToMobile) {
      onBackToMobile();
      return;
    }
    setCurrentStep(prev => Math.max(prev - 1, 2) as RegistrationStep);
  }, [currentStep, onBackToMobile]);

  const handleSubmit = useCallback(async () => {
    try {
      const employeeData = {
        mobile_number: data.basicInfo.mobileNumber,
        email: data.additionalDetails.email || null,
        uan_number: data.additionalDetails.uanNumber || null,
        esic_number: data.additionalDetails.esicNumber || null,
        marital_status: data.additionalDetails.maritalStatus || null,
        blood_group: data.additionalDetails.bloodGroup || null,
        nominee_name: data.additionalDetails.nomineeName || null,
        nominee_relationship: data.additionalDetails.nomineeRelationship || null,
        nominee_dob: data.additionalDetails.nomineeDob || null,
        nominee_contact: data.additionalDetails.nomineeContact || null,
        // Map nominee to emergency contact
        emergency_contact_name: data.additionalDetails.nomineeName || null,
        emergency_contact_relation: data.additionalDetails.nomineeRelationship || null,
        full_name: data.aadhaarDetails.fullName || null,
        father_name: data.aadhaarDetails.fatherHusbandName || null,
        date_of_birth: data.aadhaarDetails.dateOfBirth || null,
        gender: data.aadhaarDetails.gender || null,
        aadhaar_number: data.aadhaarDetails.aadhaarNumber?.replace(/\s/g, '') || null,
        address: data.aadhaarDetails.address || null,
        pin_code: data.aadhaarDetails.pinCode || null,
        state: data.aadhaarDetails.state || null,
        district: data.aadhaarDetails.district || null,
        bank_name: data.bankDetails.bankName || null,
        account_number: data.bankDetails.accountNumber || null,
        ifsc_code: data.bankDetails.ifscCode || null,
        account_holder_name: data.bankDetails.accountHolderName || null,
        // Send both client_id and client_name (API will use ID for storage)
        client_id: data.clientUnitInfo.clientId || null,
        client_name: data.clientUnitInfo.clientName || null,
        unit_id: data.clientUnitInfo.unitId || null,
        unit_name: data.clientUnitInfo.unitName || null,
        designation: data.clientUnitInfo.designation || null,
        profile_pic_url: data.documents.profilePic || null,
        aadhaar_front_url: data.documents.aadhaarFront || null,
        aadhaar_back_url: data.documents.aadhaarBack || null,
        bank_document_url: data.documents.bankDocument || null,
        status: 'pending_hr_verification',
        profile_completion: 100,
      };

      console.log('=== Submitting employee data ===');
      console.log('profile_pic_url:', employeeData.profile_pic_url);

      if (existingEmployeeId) {
        // Update existing employee
        const { error } = await updateEmployee(existingEmployeeId, employeeData);
        if (error) throw new Error(error);
      } else {
        // Insert new employee
        const { data: newEmployee, error } = await createEmployee(employeeData);
        if (error) throw new Error(error);

        // Store session
        if (newEmployee) {
          localStorage.setItem('employee_id', newEmployee.id);
        }
      }

      // Clear all stored registration data after successful submission
      localStorage.removeItem('registration_profile_pic');
      localStorage.removeItem(REGISTRATION_DATA_KEY);
      localStorage.removeItem(REGISTRATION_STEP_KEY);
      localStorage.removeItem(REGISTRATION_COMPLETED_KEY);

      // Don't call onComplete() here - let Step8Review show SuccessPage first
      // onComplete will be called by SuccessPage after WhatsApp redirect
    } catch (error) {
      console.error('Error saving registration:', error);
      throw error;
    }
  }, [data, existingEmployeeId]);

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        // Step 1 is handled outside the wizard now
        return null;
      case 2:
        return (
          <Step2AadhaarFront
            data={data.aadhaarDetails}
            documents={data.documents}
            onUpdate={updateAadhaarDetails}
            onUpdateDocuments={updateDocuments}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        );
      case 3:
        return (
          <Step3AadhaarBack
            data={data.aadhaarDetails}
            documents={data.documents}
            onUpdate={updateAadhaarDetails}
            onUpdateDocuments={updateDocuments}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        );
      case 4:
        return (
          <Step4BankDocument
            data={data.bankDetails}
            documents={data.documents}
            onUpdate={updateBankDetails}
            onUpdateDocuments={updateDocuments}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        );
      case 5:
        return (
          <Step5BankVerification
            data={data.bankDetails}
            onUpdate={updateBankDetails}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        );
      case 6:
        return (
          <Step6AdditionalDetails
            data={data.additionalDetails}
            aadhaarData={data.aadhaarDetails}
            onUpdate={updateAdditionalDetails}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        );
      case 7:
        return (
          <Step7ClientUnit
            data={data.clientUnitInfo}
            onUpdate={updateClientUnitInfo}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        );
      case 8:
        return (
          <Step8Review
            data={data}
            onBack={goToPreviousStep}
            onSubmit={handleSubmit}
            onComplete={onComplete}
          />
        );
      default:
        return null;
    }
  };

  // Calculate completion for header display
  const stepsCompleted = completedSteps.size;
  const completionPercentage = Math.round((stepsCompleted / 8) * 100);

  return (
    <div className="min-h-screen bg-background">
      {/* Header - compact for mobile */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b shadow-sm">
        <div className="container max-w-2xl mx-auto px-3 py-2 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-foreground">
            Registration
          </h1>
          <ProfileCompletion percentage={completionPercentage} />
        </div>
        <StepIndicator currentStep={currentStep} completedSteps={completedSteps} />
      </header>

      {/* Main Content */}
      <main className="container max-w-2xl mx-auto px-3 py-4 pb-16">
        {renderStep()}
      </main>

      {/* Footer - minimal for mobile */}
      <footer className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t px-3 py-2">
        <p className="text-[10px] text-center text-muted-foreground">
          Data encrypted & securely stored. By proceeding, you agree to our privacy policy.
        </p>
      </footer>
    </div>
  );
}
