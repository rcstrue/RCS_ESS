import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminSession, adminLogout, verifySession, getAdminRole, AdminUser } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Users, Building2, Briefcase, Loader2, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { EmployeeManagement } from '@/components/admin/EmployeeManagement';
import { ClientManagement } from '@/components/admin/ClientManagement';
import { DesignationManagement } from '@/components/admin/DesignationManagement';
import { UserManagement } from '@/components/admin/UserManagement';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const session = getAdminSession();
      
      if (!session) {
        navigate('/admin/login');
        return;
      }

      // Verify session with server
      const { data, error } = await verifySession();
      
      if (error || !data?.valid) {
        adminLogout();
        navigate('/admin/login');
        return;
      }

      setUser(session.user);
      setUserRole(session.user.role);
      setIsLoading(false);
    };

    checkAuth();
  }, [navigate]);

  const handleLogout = () => {
    adminLogout();
    toast.success('Logged out successfully');
    navigate('/admin/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {user?.email} • {userRole === 'admin' ? 'Administrator' : 'Manager'}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="employees">
          <TabsList className="mb-6">
            <TabsTrigger value="employees" className="gap-2">
              <Users className="w-4 h-4" />
              Employees
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-2">
              <Building2 className="w-4 h-4" />
              Clients & Units
            </TabsTrigger>
            <TabsTrigger value="designations" className="gap-2">
              <Briefcase className="w-4 h-4" />
              Designations
            </TabsTrigger>
            {userRole === 'admin' && (
              <TabsTrigger value="users" className="gap-2">
                <UserCog className="w-4 h-4" />
                Users
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="employees">
            <EmployeeManagement userRole={userRole!} />
          </TabsContent>

          <TabsContent value="clients">
            <ClientManagement />
          </TabsContent>

          <TabsContent value="designations">
            <DesignationManagement />
          </TabsContent>

          {userRole === 'admin' && (
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
