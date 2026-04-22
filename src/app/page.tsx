'use client';

import { useEmployeeSession } from '@/hooks/useEmployeeSession';
import { MobileEntry } from '@/components/registration/MobileEntry';
import { EmployeeProfile } from '@/components/registration/EmployeeProfile';
import { RegistrationWizard } from '@/components/registration/RegistrationWizard';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { getAdminSession, AdminUser } from '@/lib/api/auth';
import { Loader2, Shield } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';

type View = 'mobile-entry' | 'registration' | 'profile' | 'admin-login' | 'admin-dashboard';

// Initialize admin session outside of render
const initializeAdminSession = (): AdminUser | null => {
  if (typeof window === 'undefined') return null;
  const session = getAdminSession();
  return session?.user || null;
};

export default function Home() {
  const { 
    employee, 
    isLoading, 
    isLoggedIn, 
    login, 
    logout, 
    checkMobileExists,
    refreshEmployee 
  } = useEmployeeSession();

  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationMobile, setRegistrationMobile] = useState('');
  const [registrationProfilePic, setRegistrationProfilePic] = useState<string | undefined>();
  // Initialize adminUser from session storage directly
  const [adminUser, setAdminUser] = useState<AdminUser | null>(initializeAdminSession);

  const handleMobileSubmit = useCallback((mobile: string, profilePicUrl?: string) => {
    console.log('=== handleMobileSubmit called ===');
    console.log('mobile:', mobile);
    console.log('profilePicUrl:', profilePicUrl);
    setRegistrationMobile(mobile);
    setRegistrationProfilePic(profilePicUrl);
    setShowRegistration(true);
  }, []);

  const handleLoginSubmit = useCallback(async (mobile: string, dob: string) => {
    return login(mobile, dob);
  }, [login]);

  const handleRegistrationComplete = useCallback(() => {
    refreshEmployee();
    setShowRegistration(false);
  }, [refreshEmployee]);

  const handleLogout = useCallback(() => {
    logout();
    setShowRegistration(false);
    setRegistrationMobile('');
  }, [logout]);

  const handleStartRegistration = useCallback(() => {
    if (employee) {
      setRegistrationMobile(employee.mobile_number);
    }
    setShowRegistration(true);
  }, [employee]);

  const handleAdminLogin = useCallback((user: AdminUser) => {
    setAdminUser(user);
  }, []);

  const handleAdminLogout = useCallback(() => {
    setAdminUser(null);
  }, []);

  // Determine the current view based on state
  const currentView = useMemo<View>(() => {
    if (adminUser) return 'admin-dashboard';
    if (showRegistration) return 'registration';
    if (isLoggedIn && employee) return 'profile';
    return 'mobile-entry';
  }, [adminUser, showRegistration, isLoggedIn, employee]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Admin Dashboard
  if (currentView === 'admin-dashboard' && adminUser) {
    return (
      <AdminDashboard 
        user={adminUser} 
        onLogout={handleAdminLogout} 
      />
    );
  }

  // Admin Login
  if (currentView === 'admin-login') {
    return (
      <AdminLogin 
        onLogin={handleAdminLogin}
        onBack={() => {}} // Will be handled by the component
      />
    );
  }

  // Render based on current view
  switch (currentView) {
    case 'registration':
      return (
        <RegistrationWizard
          initialMobile={registrationMobile}
          initialProfilePic={registrationProfilePic}
          existingEmployeeId={employee?.id}
          existingEmployee={employee || null}
          onComplete={handleRegistrationComplete}
          onBack={() => {
            setShowRegistration(false);
            setRegistrationProfilePic(undefined);
          }}
        />
      );

    case 'profile':
      if (!employee) {
        return (
          <MobileEntry
            onMobileSubmit={handleMobileSubmit}
            onLoginSubmit={handleLoginSubmit}
            checkMobileExists={checkMobileExists}
          />
        );
      }
      return (
        <EmployeeProfile
          employee={employee}
          onLogout={handleLogout}
          onRefresh={refreshEmployee}
          onStartRegistration={handleStartRegistration}
        />
      );

    case 'mobile-entry':
    default:
      return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
          <div className="absolute top-4 right-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                const session = getAdminSession();
                if (session) {
                  setAdminUser(session.user);
                } else {
                  // Show admin login in place
                  window.location.reload();
                }
              }}
              className="gap-2"
            >
              <Shield className="w-4 h-4" />
              Admin
            </Button>
          </div>
          <MobileEntry
            onMobileSubmit={handleMobileSubmit}
            onLoginSubmit={handleLoginSubmit}
            checkMobileExists={checkMobileExists}
          />
        </div>
      );
  }
}
