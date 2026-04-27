'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { Employee } from '@/lib/ess-types';
import { changePin } from '@/lib/ess-api';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  Building2,
  LogOut,
  KeyRound,
  RefreshCw,
  ChevronRight,
  Loader2,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// SettingsView Component
// ══════════════════════════════════════════════════════════════

export default function SettingsView({
  employee,
  onLogout,
}: {
  employee: Employee;
  onLogout: () => void;
}) {
  const [darkMode, setDarkMode] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setDarkMode(isDark);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.classList.toggle('dark', newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

  const handleUpdateApp = () => {
    setIsUpdating(true);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.update())).catch(() => {});
    }
    toast.info('Checking for updates...');
    setTimeout(() => setIsUpdating(false), 3000);
  };

  const handleChangePin = async () => {
    if (!currentPin || !newPin || !confirmPin) {
      toast.error('All fields are required');
      return;
    }
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin) || !/^\d{4}$/.test(confirmPin)) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    if (newPin === currentPin) {
      toast.error('New PIN must be different from current PIN');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('New PIN and confirm PIN do not match');
      return;
    }
    setIsChangingPin(true);
    try {
      const { error } = await changePin(employee.id, currentPin, newPin);
      if (error) {
        toast.error(error);
      } else {
        toast.success('PIN changed successfully');
        setShowPinDialog(false);
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
      }
    } catch {
      toast.error('Failed to change PIN');
    } finally {
      setIsChangingPin(false);
    }
  };

  return (
    <>
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500">Manage your app preferences</p>
      </div>

      {/* Dark Mode */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100">
                <Shield className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Dark Mode</p>
                <p className="text-xs text-gray-400">Switch between light and dark theme</p>
              </div>
            </div>
            <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
          </div>
        </CardContent>
      </Card>

      {/* Change PIN */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <button onClick={() => setShowPinDialog(true)} className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-50">
                <KeyRound className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Change PIN</p>
                <p className="text-xs text-gray-400">Update your login PIN</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </CardContent>
      </Card>

      {/* Update App */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <button onClick={handleUpdateApp} className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-sky-50">
                <RefreshCw className={`w-4 h-4 text-sky-600 ${isUpdating ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Update App</p>
                <p className="text-xs text-gray-400">Check for latest version</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50">
              <Building2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">About</p>
              <p className="text-xs text-gray-400">App information & version</p>
            </div>
          </div>
          <Separator />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">App Name</span>
              <span className="text-gray-800 font-medium">RCS Employee Self-Service</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Version</span>
              <span className="text-gray-800 font-medium">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Employee</span>
              <span className="text-gray-800 font-medium">{employee.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Employee Code</span>
              <span className="text-gray-800 font-medium">{employee.employee_code || `EMP-${employee.id}`}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logout */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <Button
            variant="destructive"
            className="w-full"
            onClick={onLogout}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
          <p className="text-xs text-gray-400 text-center mt-2">
            You will need to login again to access the app
          </p>
        </CardContent>
      </Card>
    </div>

    {/* Change PIN Dialog */}
    <Dialog open={showPinDialog} onOpenChange={(open) => {
      setShowPinDialog(open);
      if (!open) { setCurrentPin(''); setNewPin(''); setConfirmPin(''); }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            Change PIN
          </DialogTitle>
          <DialogDescription>
            Enter your current PIN and choose a new 4-digit PIN.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Current PIN</label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="Enter current PIN"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">New PIN</label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="Enter new 4-digit PIN"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Confirm New PIN</label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="Confirm new PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => { setShowPinDialog(false); setCurrentPin(''); setNewPin(''); setConfirmPin(''); }} disabled={isChangingPin}>
            Cancel
          </Button>
          <Button onClick={handleChangePin} disabled={isChangingPin || !currentPin || !newPin || !confirmPin}>
            {isChangingPin ? <><Loader2 className="h-4 w-4 animate-spin" />Changing...</> : 'Change PIN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>);
}
