'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { Employee } from '@/lib/ess-types';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Shield,
  Building2,
  LogOut,
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

  return (
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
  );
}
