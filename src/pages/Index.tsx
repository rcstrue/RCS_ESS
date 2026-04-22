import { useState, useEffect } from 'react';
import { useEmployeeSession, calculateProfileCompletion } from '@/hooks/useEmployeeSession';
import { MobileEntry } from '@/components/registration/MobileEntry';
import { EmployeeProfile } from '@/components/registration/EmployeeProfile';
import { RegistrationWizard } from '@/components/registration/RegistrationWizard';
import { Loader2 } from 'lucide-react';

// LocalStorage keys for form persistence
const REGISTRATION_DATA_KEY = 'registration_form_data';
const REGISTRATION_MOBILE_KEY = 'registration_mobile';
const REGISTRATION_STEP_KEY = 'registration_current_step';

type AppView = 'loading' | 'mobile-entry' | 'registration' | 'profile';

const Index = () => {
  const { 
    employee, 
    isLoading, 
    isLoggedIn, 
    login, 
    logout, 
    checkMobileExists,
    refreshEmployee 
  } = useEmployeeSession();

  const [view, setView] = useState<AppView>('loading');
  const [registrationMobile, setRegistrationMobile] = useState('');
  const [registrationProfilePic, setRegistrationProfilePic] = useState<string | undefined>();

  // 🔥 Check for saved registration progress on mount
  useEffect(() => {
    if (isLoading) return; // Wait for employee session to load

    const savedData = localStorage.getItem(REGISTRATION_DATA_KEY);
    const savedMobile = localStorage.getItem(REGISTRATION_MOBILE_KEY);
    const savedStep = localStorage.getItem(REGISTRATION_STEP_KEY);

    // IF localStorage has data → open form directly
    if (savedData && savedMobile) {
      console.log('🔄 Found saved registration progress, restoring...');
      setRegistrationMobile(savedMobile);
      setView('registration');
    } else if (isLoggedIn) {
      setView('profile');
    } else {
      setView('mobile-entry');
    }
  }, [isLoading, isLoggedIn]);

  // Show loading while checking session
  if (isLoading && view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If logged in but on mobile entry, redirect to profile
  if (isLoggedIn && view === 'mobile-entry') {
    setView('profile');
    return null;
  }

  const handleMobileSubmit = (mobile: string, profilePicUrl?: string) => {
    console.log('=== Index handleMobileSubmit ===');
    console.log('mobile:', mobile);
    console.log('profilePicUrl:', profilePicUrl);
    
    // 📌 Save mobile to localStorage for persistence
    localStorage.setItem(REGISTRATION_MOBILE_KEY, mobile);
    
    setRegistrationMobile(mobile);
    setRegistrationProfilePic(profilePicUrl);
    setView('registration');
  };

  const handleLoginSubmit = async (mobile: string, dob: string) => {
    const result = await login(mobile, dob);
    if (result.success) {
      setView('profile');
    }
    return result;
  };

  const handleRegistrationComplete = () => {
    // ✅ Clear all saved registration data after final submit
    localStorage.removeItem(REGISTRATION_DATA_KEY);
    localStorage.removeItem(REGISTRATION_MOBILE_KEY);
    localStorage.removeItem(REGISTRATION_STEP_KEY);
    localStorage.removeItem('registration_completed_steps');
    localStorage.removeItem('registration_profile_pic');
    
    refreshEmployee();
    setView('profile');
    setRegistrationProfilePic(undefined);
  };

  const handleLogout = () => {
    // ✅ Clear all saved registration data on logout
    localStorage.removeItem(REGISTRATION_DATA_KEY);
    localStorage.removeItem(REGISTRATION_MOBILE_KEY);
    localStorage.removeItem(REGISTRATION_STEP_KEY);
    localStorage.removeItem('registration_completed_steps');
    localStorage.removeItem('registration_profile_pic');
    
    logout();
    setView('mobile-entry');
    setRegistrationMobile('');
    setRegistrationProfilePic(undefined);
  };

  const handleStartRegistration = () => {
    if (employee) {
      // 📌 Save mobile to localStorage for persistence
      localStorage.setItem(REGISTRATION_MOBILE_KEY, employee.mobile_number);
      setRegistrationMobile(employee.mobile_number);
    }
    setView('registration');
  };

  switch (view) {
    case 'mobile-entry':
      return (
        <MobileEntry
          onMobileSubmit={handleMobileSubmit}
          onLoginSubmit={handleLoginSubmit}
          checkMobileExists={checkMobileExists}
        />
      );

    case 'registration':
      return (
        <RegistrationWizard
          initialMobile={registrationMobile}
          initialProfilePic={registrationProfilePic}
          existingEmployeeId={employee?.id}
          existingEmployee={employee || null}
          onComplete={handleRegistrationComplete}
          onBack={() => {
            // Clear saved data when user goes back to mobile entry
            localStorage.removeItem(REGISTRATION_DATA_KEY);
            localStorage.removeItem(REGISTRATION_MOBILE_KEY);
            localStorage.removeItem(REGISTRATION_STEP_KEY);
            localStorage.removeItem('registration_completed_steps');
            setView('mobile-entry');
            setRegistrationMobile('');
            setRegistrationProfilePic(undefined);
          }}
        />
      );

    case 'profile':
      if (!employee) {
        setView('mobile-entry');
        return null;
      }
      return (
        <EmployeeProfile
          employee={employee}
          onLogout={handleLogout}
          onRefresh={refreshEmployee}
          onStartRegistration={handleStartRegistration}
        />
      );

    default:
      return null;
  }
};

export default Index;
