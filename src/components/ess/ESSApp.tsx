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
import PageHeader from './PageHeader';
import BottomNav from './BottomNav';
import AttendancePage from './AttendancePage';
import LeavesPage from './LeavesPage';
import { ExpensesPage } from './ExpensesPage';
import { TasksPage } from './TasksPage';
import HelpdeskPage from './HelpdeskPage';
import AnnouncementsPage from './AnnouncementsPage';
import DirectoryPage from './DirectoryPage';

// Hook
import { useDashboard } from './hooks/useDashboard';

// Helpers
import { getGreeting, getInitials, getScope, canApprove } from './helpers';

// shadcn/ui
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// lucide icons
import { Building2, Loader2 } from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// ESSApp — Slim orchestrator: auth, navigation, routing
// ══════════════════════════════════════════════════════════════

export default function ESSApp({ onBackToRegistration }: { onBackToRegistration: () => void }) {
  // ── Auth ──
  const [session, setSession] = useState<ESSSession | null>(null);
  const [forcePinSession, setForcePinSession] = useState<ESSSession | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const loadSession = useCallback(() => {
    try {
      const stored = localStorage.getItem('ess_employee');
      if (stored) {
        const parsed = JSON.parse(stored) as ESSSession;
        if (parsed?.employee?.id) { setSession(parsed); return; }
      }
    } catch { /* invalid */ }
    localStorage.removeItem('ess_employee');
  }, []);

  useEffect(() => { loadSession(); setAuthReady(true); }, [loadSession]);

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

  const handleLogin = useCallback((s: ESSSession) => {
    saveSession(s);
    toast.success(`Welcome, ${s.employee.full_name}!`);
  }, [saveSession]);

  const handleForcePinChange = useCallback((s: ESSSession) => {
    setForcePinSession(s);
  }, []);

  const handleForcePinComplete = useCallback((s: ESSSession) => {
    setForcePinSession(null);
    saveSession(s);
    toast.success(`Welcome, ${s.employee.full_name}!`);
  }, [saveSession]);

  // ── Navigation ──
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const navigate = useCallback((page: string) => {
    if (page === 'logout') { clearSession(); return; }
    setCurrentPage(page);
    setShowMoreMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [clearSession]);

  // ── Dashboard ──
  const { dashboardData, dashboardLoading, checkInLoading, checkOutLoading, loadDashboardData, handleCheckIn, handleCheckOut } = useDashboard(session);

  // Refresh when navigating BACK to dashboard (skip initial mount — useDashboard handles that)
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

  // ── Force PIN change screen ──
  if (forcePinSession) {
    return (
      <ForceChangePin
        session={forcePinSession}
        onComplete={handleForcePinComplete}
        onLogout={clearSession}
      />
    );
  }

  if (!session) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onBackToRegistration={onBackToRegistration}
        onForcePinChange={handleForcePinChange}
      />
    );
  }

  // ── Derived ──
  const emp = session.employee;
  const role = session.role;
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
          <Avatar className="w-9 h-9 border border-emerald-200">
            <AvatarImage src={getFileUrl(emp.profile_pic_url) || undefined} alt={emp.full_name} />
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{emp.full_name}</p>
            <p className="text-xs text-gray-500 truncate">{emp.designation || emp.employee_role || 'Employee'}</p>
          </div>
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
            <DashboardHome
              employee={emp} role={role} dashboardData={dashboardData}
              loading={dashboardLoading} onNavigate={navigate}
              onCheckIn={handleCheckIn} onCheckOut={handleCheckOut}
              checkInLoading={checkInLoading} checkOutLoading={checkOutLoading}
            />
          </div>
        )}
        {currentPage === 'directory' && (<><PageHeader title="Employees" subtitle="Search & browse the employee directory" /><DirectoryPage employeeId={emp.id} role={role} scope={scope} /></>)}
        {currentPage === 'expenses' && (<><PageHeader title="Expenses" subtitle="Submit & track expense claims" /><ExpensesPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} canApprove={isApprover} /></>)}
        {currentPage === 'attendance' && (<><PageHeader title="Attendance" subtitle="View your attendance history" onBack={() => navigate('dashboard')} /><AttendancePage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} /></>)}
        {currentPage === 'leaves' && (<><PageHeader title="Leave" subtitle="Apply & track leave requests" onBack={() => navigate('dashboard')} /><LeavesPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} canApprove={isApprover} /></>)}
        {currentPage === 'tasks' && (<><PageHeader title="Tasks" subtitle="Manage your task assignments" onBack={() => navigate('dashboard')} /><TasksPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} role={role} canApprove={isApprover} /></>)}
        {currentPage === 'announcements' && (<><PageHeader title="Notices" subtitle="Company announcements & updates" onBack={() => navigate('dashboard')} /><AnnouncementsPage employeeId={emp.id} role={role} canPost={canPost} /></>)}
        {currentPage === 'helpdesk' && (<><PageHeader title="Help Desk" subtitle="Submit & track support tickets" onBack={() => navigate('dashboard')} /><HelpdeskPage employeeId={emp.id} employeeName={emp.full_name || 'Employee'} /></>)}
        {currentPage === 'profile' && <ProfileView employee={emp} role={role} onNavigate={navigate} />}
        {currentPage === 'settings' && <SettingsView employee={emp} onLogout={clearSession} />}
      </main>

      <BottomNav currentPage={currentPage} showMoreMenu={showMoreMenu} setShowMoreMenu={setShowMoreMenu} onNavigate={navigate} />
    </div>
  );
}
