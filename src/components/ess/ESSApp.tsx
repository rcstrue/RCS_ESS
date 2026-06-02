'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { ESSSession } from '@/lib/ess-types';
import { getFileUrl, resetSessionExpiredGuard } from '@/lib/api/config';

// Extracted modules
import LoginScreen from './LoginScreen';
import ForceChangePin from './ForceChangePin';
import FirstLoginPinPopup from './FirstLoginPinPopup';
import DashboardHome from './DashboardHome';
import ProfileView from './ProfileView';
import SettingsView from './SettingsView';
import BottomNav from './BottomNav';
import AttendancePage from './AttendancePage';
import LeavesPage from './LeavesPage';
import { ExpensesPage } from './ExpensesPage';
import { TasksPage } from './TasksPage';
import HelpdeskPage from './HelpdeskPage';
import AnnouncementsPage from './AnnouncementsPage';
import DirectoryPage from './DirectoryPage';
import { InstallBanner, PermissionDialog } from './InstallBanner';

// Hook
import { useDashboard } from './hooks/useDashboard';
import { usePwaInstall } from './hooks/usePwaInstall';

// Helpers
import { getGreeting, getInitials, getScope, canApprove } from './helpers';

// shadcn/ui
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// lucide icons
import { Building2, Loader2, UserPlus } from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// ESSApp — Slim orchestrator: auth, navigation, routing
// ══════════════════════════════════════════════════════════════

export default function ESSApp({ onBackToRegistration }: { onBackToRegistration: () => void }) {
  // ── Auth ──
  const [session, setSession] = useState<ESSSession | null>(null);
  const [forcePinSession, setForcePinSession] = useState<ESSSession | null>(null);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [showFirstLoginPopup, setShowFirstLoginPopup] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const loadSession = useCallback(() => {
    try {
      const stored = localStorage.getItem('ess_employee');
      if (stored) {
        const parsed = JSON.parse(stored) as ESSSession;
        if (parsed?.employee?.id) {
          // If user hasn't completed PIN change, show the popup (not full screen)
          if (!parsed.has_custom_pin) {
            setForcePinSession(parsed);
            setIsFirstLogin(true);
            // Also re-save standalone token as backup for mobile localStorage reliability
            if (parsed.token) {
              localStorage.setItem('ess_token', parsed.token);
            }
            return;
          }
          setSession(parsed);
          return;
        }
      }
    } catch { /* invalid */ }
    localStorage.removeItem('ess_employee');
  }, []);

  useEffect(() => {
    loadSession();
    setAuthReady(true);
  }, [loadSession]);

  // Show first-login popup once when forcePinSession is set
  useEffect(() => {
    if (forcePinSession && isFirstLogin && !session) {
      // Small delay so the dashboard renders behind the popup
      const timer = setTimeout(() => {
        setShowFirstLoginPopup(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [forcePinSession, isFirstLogin, session]);

  // ── Listen for session expiry (401 interceptor dispatches this) ──
  useEffect(() => {
    const handler = () => {
      setSession(null);
      setForcePinSession(null);
      setShowFirstLoginPopup(false);
      setCurrentPage('dashboard');
      toast.error('Session expired. Please login again.');
    };
    window.addEventListener('ess:session-expired', handler);
    return () => window.removeEventListener('ess:session-expired', handler);
  }, []);

  const saveSession = useCallback((s: ESSSession) => {
    localStorage.setItem('ess_employee', JSON.stringify(s));
    setSession(s);
    resetSessionExpiredGuard();
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem('ess_employee');
    localStorage.removeItem('ess_token');
    setSession(null);
    setForcePinSession(null);
    setShowFirstLoginPopup(false);
    setCurrentPage('dashboard');
    toast.success('Logged out successfully');
  }, []);

  const handleLogin = useCallback((s: ESSSession) => {
    saveSession(s);
    toast.success(`Welcome, ${s.employee.full_name}!`);
  }, [saveSession]);

  const handleForcePinChange = useCallback((s: ESSSession) => {
    setForcePinSession(s);
    setIsFirstLogin(true);
    // Persist to localStorage immediately
    localStorage.setItem('ess_employee', JSON.stringify(s));
    if (s.token) {
      localStorage.setItem('ess_token', s.token);
    }
  }, []);

  // Called when first-login popup completes (user sets PIN or cancels)
  const handleFirstLoginComplete = useCallback((s: ESSSession) => {
    setForcePinSession(null);
    setIsFirstLogin(false);
    setShowFirstLoginPopup(false);
    saveSession(s);
    if (s.has_custom_pin) {
      toast.success(`Welcome, ${s.employee.full_name}!`);
    }
  }, [saveSession]);

  // Called when force PIN change completes (from full-screen ForceChangePin)
  const handleForcePinComplete = useCallback((s: ESSSession) => {
    setForcePinSession(null);
    setIsFirstLogin(false);
    saveSession(s);
    toast.success(`Welcome, ${s.employee.full_name}!`);
  }, [saveSession]);

  // ── Navigation ──
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const navigate = useCallback((page: string) => {
    if (page === 'logout') { clearSession(); return; }
    if (page === 'new-registration') {
      localStorage.removeItem('ess_employee');
      localStorage.removeItem('ess_token');
      setSession(null);
      setForcePinSession(null);
      setShowFirstLoginPopup(false);
      window.location.hash = '/';
      return;
    }
    setCurrentPage(page);
    setShowMoreMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [clearSession]);

  // ── Dashboard ──
  const { dashboardData, dashboardLoading, checkInLoading, checkOutLoading, loadDashboardData, handleCheckIn, handleCheckOut } = useDashboard(session);

  // ── PWA Install ──
  const pwa = usePwaInstall();

  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (currentPage === 'dashboard' && session) loadDashboardData();
  }, [currentPage, session, loadDashboardData]);

  // ── Loading ──
  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  // ── Force PIN change (full screen — only used for non-first-login forced changes) ──
  if (forcePinSession && !isFirstLogin && !showFirstLoginPopup) {
    return (
      <ForceChangePin
        session={forcePinSession}
        onComplete={handleForcePinComplete}
        onLogout={clearSession}
        isFirstLogin={false}
      />
    );
  }

  // ── First login: show dashboard with PIN popup overlay ──
  if (!session && !forcePinSession) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onBackToRegistration={onBackToRegistration}
        onForcePinChange={handleForcePinChange}
      />
    );
  }

  // For first login, create a temporary session to render the dashboard behind the popup
  const activeSession = session || forcePinSession;
  if (!activeSession) return null;

  const emp = activeSession.employee;
  const role = activeSession.role;
  const scope = getScope(role);
  const initials = getInitials(emp.full_name || 'U');
  const isApprover = canApprove(role);
  const canPost = role !== 'employee';

  // ════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b">
        <div className="flex items-center gap-3 px-4 h-14">
          <button className="shrink-0" onClick={() => navigate('profile')} title="View Profile">
            <Avatar className="w-9 h-9 border border-emerald-200">
              <AvatarImage src={getFileUrl(emp.profile_pic_url) || undefined} alt={emp.full_name} />
              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-bold">{initials}</AvatarFallback>
            </Avatar>
          </button>
          <button className="flex-1 min-w-0 text-left" onClick={() => navigate('profile')} title="View Profile">
            <p className="text-sm font-semibold text-gray-900 truncate">{emp.full_name}</p>
            <p className="text-xs text-gray-500 truncate">
              {emp.employee_code || `EMP-${emp.id}`}{emp.designation ? ` · ${emp.designation}` : ''}
            </p>
          </button>
          <button
            onClick={() => navigate('new-registration')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
            title="New Registration"
          >
            <UserPlus className="w-4 h-4" />
            <span className="text-xs font-medium hidden sm:inline">New Registration</span>
          </button>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-600">
            <Building2 className="w-4 h-4 text-white" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 py-4 pb-24">
        {currentPage === 'dashboard' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{getGreeting()}, {emp.full_name?.split(' ')[0]} 👋</h2>
              <p className="text-sm text-gray-500 mt-0.5">{new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
            {/* PWA Install Banner */}
            {pwa.shouldShowInstall && currentPage === 'dashboard' && (
              <InstallBanner
                onInstall={pwa.install}
                onDismiss={pwa.dismiss}
                isIOS={pwa.state.isIOS}
              />
            )}
            <DashboardHome
              employee={emp} role={role} dashboardData={dashboardData}
              loading={dashboardLoading} onNavigate={navigate}
              onCheckIn={handleCheckIn} onCheckOut={handleCheckOut}
              checkInLoading={checkInLoading} checkOutLoading={checkOutLoading}
            />
          </div>
        )}
        {currentPage === 'directory' && <DirectoryPage employeeId={emp.id} role={role} scope={scope} />}
        {currentPage === 'expenses' && <ExpensesPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} canApprove={isApprover} />}
        {currentPage === 'attendance' && <AttendancePage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} />}
        {currentPage === 'leaves' && <LeavesPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} canApprove={isApprover} />}
        {currentPage === 'tasks' && <TasksPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} canApprove={isApprover} />}
        {currentPage === 'announcements' && <AnnouncementsPage employeeId={emp.id} role={role} canPost={canPost} />}
        {currentPage === 'helpdesk' && <HelpdeskPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} />}
        {currentPage === 'profile' && <ProfileView employee={emp} role={role} onNavigate={navigate} />}
        {currentPage === 'settings' && <SettingsView employee={emp} onLogout={clearSession} />}
      </main>

      <BottomNav currentPage={currentPage} showMoreMenu={showMoreMenu} setShowMoreMenu={setShowMoreMenu} onNavigate={navigate} />

      {/* First Login PIN Popup */}
      {forcePinSession && (
        <FirstLoginPinPopup
          open={showFirstLoginPopup}
          session={forcePinSession}
          onComplete={handleFirstLoginComplete}
          onDismiss={handleFirstLoginComplete}
        />
      )}

      {/* Post-Install Permission Dialog */}
      <PermissionDialog
        open={pwa.shouldShowPermissions && !showFirstLoginPopup}
        onRequest={pwa.requestPermissions}
        onSkip={pwa.requestPermissions} // Will mark as done on skip too
        currentPermissions={pwa.state.permissions}
      />
    </div>
  );
}
