'use client';

import { useState } from 'react';
import { adminLogout, AdminUser } from '@/lib/api/auth';
import { EmployeeManagement } from './EmployeeManagement';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { LogOut, Users } from 'lucide-react';

interface AdminDashboardProps {
  user: AdminUser;
  onLogout: () => void;
}

export function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState('employees');

  const handleLogout = () => {
    adminLogout();
    toast.success('Logged out successfully');
    onLogout();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">RCS Facility - HRMS</h1>
            <span className={`text-xs px-2 py-1 rounded-full ${
              user.role === 'admin' 
                ? 'bg-primary/10 text-primary' 
                : 'bg-secondary text-secondary-foreground'
            }`}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="employees" className="gap-2">
              <Users className="w-4 h-4" />
              Employees
            </TabsTrigger>
          </TabsList>

          <TabsContent value="employees">
            <EmployeeManagement userRole={user.role} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
