'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { ESSSession } from '@/lib/ess-types';
import { getFileUrl, resetSessionExpiredGuard } from '@/lib/api/config';

// Extracted modules
import LoginScreen from './LoginScreen';
import ForceChangePin from './ForceChangePin';
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
import NotificationsPage from './NotificationsPage';
import HolidaysPage from './HolidaysPage';
import EditProfilePage from './EditProfilePage';
import RegularizationPage from './RegularizationPage';
import { InstallBanner, PermissionDialog } from './InstallBanner';

// Hook
import { useDashboard } from './hooks/useDashboard';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useNotifications } from './hooks/useNotifications';

// Access
import { AccessProvider, useAccess } from '@/contexts/AccessContext';

// Helpers
import { getGreeting, getInitials, getScope, canApprove, detectRole } from './helpers';

// shadcn/ui
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// lucide icons
import { Building2, Loader2, UserPlus, Bell, Users } from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// ESSApp — Slim orchestrator: auth, navigation, routing
// ══════════════════════════════════════════════════════════════

export default function ESSApp({ onBackToRegistration }: { onBackToRegistration: () => void }) {
  return (
    <AccessProvider>
      <ESSAppInner onBackToRegistration={onBackToRegistration} />
    </AccessProvider>
  );
}

function ESSAppInner({ onBackToRegistration }: { onBackToRegistration: () => void }) {
  // ── Auth ──
  const [session, setSession] = useState<ESSSession | null>(null);
  const [forcePinSession, setForcePinSession] = useState<ESSSession | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const loadSession = useCallback(() => {
    try {
      const stored = localStorage.getItem('ess_employee');
      if (stored) {
        const parsed = JSON.parse(stored) as ESSSession;
        if (parsed?.employee?.id) {
          // Re-derive role for old sessions that didn't store it
          if (!parsed.role) {
            parsed.role = detectRole(parsed.employee);
            localStorage.setItem('ess_employee', JSON.stringify(parsed));
          }
          // If user hasn't completed PIN change, show full-screen force PIN change
          // Only trigger when has_custom_pin is explicitly false (not undefined from old sessions)
          if (parsed.has_custom_pin === false) {
            setForcePinSession(parsed);
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

  // ── Listen for session expiry (401 interceptor dispatches this) ──
  useEffect(() => {
    const handler = () => {
      setSession(null);
      setForcePinSession(null);
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
    setCurrentPage('dashboard');
    toast.success('Logged out successfully');
  }, []);

  const clearSessionAndAccess = useCallback(() => {
    clearSession();
    // AccessProvider will handle clearing access via its own context
  }, [clearSession]);

  const handleLogin = useCallback((s: ESSSession) => {
    saveSession(s);
    toast.success(`Welcome, ${s.employee.full_name}!`);
  }, [saveSession]);

  const handleForcePinChange = useCallback((s: ESSSession) => {
    setForcePinSession(s);
    // Persist to localStorage immediately
    localStorage.setItem('ess_employee', JSON.stringify(s));
    if (s.token) {
      localStorage.setItem('ess_token', s.token);
    }
  }, []);

  // Called when force PIN change completes (from full-screen ForceChangePin)
  const handleFirstLoginComplete = useCallback((s: ESSSession) => {
    setForcePinSession(null);
    saveSession(s);
    if (s.has_custom_pin) {
      toast.success(`Welcome, ${s.employee.full_name}!`);
    }
  }, [saveSession]);

  // ── Access (must be after session check, before render) ──
  const access = useAccess();

  // Fetch access allocation when session becomes available
  useEffect(() => {
    if (session && !access.isLoaded) {
      access.refreshAccess();
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear access on logout
  useEffect(() => {
    if (!session && access.isLoaded) {
      access.clearAccess();
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ──
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // ── Notifications (unconditionally before early returns) ──
  const notifications = useNotifications(session?.employee?.id ?? 0);
  const handleAddNotification = (title: string, message: string, type: 'leave' | 'expense' | 'task' | 'helpdesk') => {
    notifications.addNotification(title, message, type);
  };

  // ── PWA Install (must be before navigate which references pwa) ──
  const pwa = usePwaInstall();

  const navigate = useCallback((page: string) => {
    if (page === 'logout') { clearSession(); return; }
    if (page === 'new-registration') {
      localStorage.removeItem('ess_employee');
      localStorage.removeItem('ess_token');
      setSession(null);
      setForcePinSession(null);
      window.location.hash = '/';
      return;
    }
    if (page === 'install-app') {
      // Reset dismissed state so banner shows again
      pwa.resetDismiss();
      // Try native install prompt, fallback to instructions
      pwa.install().then((accepted) => {
        if (!accepted && !pwa.state.canInstall) {
          // Show instructions based on platform
          const msg = pwa.state.isIOS
            ? 'To install: Tap the Share button → "Add to Home Screen"'
            : 'To install: Tap the menu (⋮) in your browser → "Install app" or "Add to Home Screen"';
          toast.info(msg, { duration: 5000 });
        }
      });
      setShowMoreMenu(false);
      return;
    }
    setCurrentPage(page);
    setShowMoreMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [clearSession, pwa]);

  // ── Dashboard ──
  const { dashboardData, dashboardLoading, checkInLoading, checkOutLoading, loadDashboardData, handleCheckIn, handleCheckOut } = useDashboard(session);

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

  // ── Force PIN change (full screen) ──
  if (forcePinSession) {
    return (
      <ForceChangePin
        session={forcePinSession}
        onComplete={handleFirstLoginComplete}
        onLogout={clearSession}
        isFirstLogin={true}
      />
    );
  }

  // ── Login screen ──
  if (!session && !forcePinSession) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onBackToRegistration={onBackToRegistration}
        onForcePinChange={handleForcePinChange}
      />
    );
  }

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
          <button
            onClick={() => navigate('notifications')}
            className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-white border shadow-sm hover:bg-gray-50 transition-colors"
            title="Notifications"
          >
            <Bell className="w-4 h-4 text-gray-600" />
            {notifications.unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {notifications.unreadCount > 9 ? '9+' : notifications.unreadCount}
              </span>
            )}
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
              onAddNotification={handleAddNotification}
            />
          </div>
        )}
        {currentPage === 'directory' && access.canViewDirectory() && (
          <DirectoryPage
            employeeId={emp.id}
            role={role}
            scope={scope}
            accessLevel={access.accessLevel}
            cityIds={access.allocation?.cities ?? []}
            unitIds={access.allocation?.units ?? []}
            cityIdsParam={access.cityIdsParam}
            unitIdsParam={access.unitIdsParam}
          />
        )}
        {currentPage === 'directory' && !access.canViewDirectory() && access.isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="text-sm text-muted-foreground">Loading access permissions...</p>
          </div>
        )}
        {currentPage === 'directory' && !access.canViewDirectory() && !access.isLoading && access.isLoaded && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Users className="h-10 w-10 text-muted-foreground/50" />
            <div className="text-center">
              <p className="font-medium text-muted-foreground">Access Restricted</p>
              <p className="text-sm text-muted-foreground/70">
                You don't have permission to view the employee directory.
              </p>
            </div>
          </div>
        )}
        {currentPage === 'expenses' && <ExpensesPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} canApprove={isApprover} onAddNotification={handleAddNotification} />}
        {currentPage === 'attendance' && <AttendancePage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} />}
        {currentPage === 'leaves' && <LeavesPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} canApprove={isApprover} onAddNotification={handleAddNotification} />}
        {currentPage === 'tasks' && <TasksPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} canApprove={isApprover} onAddNotification={handleAddNotification} />}
        {currentPage === 'announcements' && <AnnouncementsPage employeeId={emp.id} role={role} canPost={canPost} />}
        {currentPage === 'helpdesk' && <HelpdeskPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} onAddNotification={handleAddNotification} />}
        {currentPage === 'notifications' && (
          <NotificationsPage
            notifications={notifications.notifications}
            unreadCount={notifications.unreadCount}
            onMarkAsRead={notifications.markAsRead}
            onMarkAllRead={notifications.markAllRead}
            onClearAll={notifications.clearAll}
          />
        )}
        {currentPage === 'holidays' && <HolidaysPage />}
        {currentPage === 'edit-profile' && (
          <EditProfilePage
            employee={emp}
            onSave={(updated) => {
              const merged = { ...emp, ...updated };
              saveSession({ ...activeSession!, employee: merged });
              toast.success('Profile updated successfully');
            }}
            onBack={() => navigate('profile')}
          />
        )}
        {currentPage === 'regularization' && <RegularizationPage employeeId={emp.id} />}
        {currentPage === 'profile' && <ProfileView employee={emp} role={role} onNavigate={navigate} />}
        {currentPage === 'settings' && <SettingsView employee={emp} onLogout={clearSession} />}
      </main>

      <BottomNav currentPage={currentPage} showMoreMenu={showMoreMenu} setShowMoreMenu={setShowMoreMenu} onNavigate={navigate} isInstalled={pwa.state.isInstalled} canViewDirectory={access.canViewDirectory()} />

      {/* Post-Install Permission Dialog */}
      <PermissionDialog
        open={pwa.shouldShowPermissions}
        onRequest={pwa.requestPermissions}
        onSkip={pwa.requestPermissions}
        currentPermissions={pwa.state.permissions}
      />
    </div>
  );
}
