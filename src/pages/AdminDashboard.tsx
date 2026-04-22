import { useState } from 'react';
import { User, Users, LogOut, Menu, X } from 'lucide-react';
import { EmployeeManagement } from '@/components/admin/EmployeeManagement';
import { EmployeeProfileView } from '@/components/admin/EmployeeProfileView';

interface AdminUser {
  id: number;
  username: string;
  role: string;
  name: string;
}

interface AdminDashboardProps {
  user?: AdminUser | null;
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleViewEmployee = (employeeId: number) => {
    setSelectedEmployeeId(employeeId);
    setSidebarOpen(false);
  };

  const handleBackToList = () => {
    setSelectedEmployeeId(null);
  };

  const handleLogout = () => {
    // Clear local storage
    localStorage.removeItem('adminUser');
    localStorage.removeItem('token');
    // Call parent logout
    if (onLogout) {
      onLogout();
    }
    // Force reload to login
    window.location.href = '/#/admin';
  };

  // If viewing specific employee
  if (selectedEmployeeId) {
    return (
      <EmployeeProfileView
        employeeId={selectedEmployeeId}
        onBack={handleBackToList}
      />
    );
  }

  const displayName = user?.name || user?.username || 'Admin';
  const displayRole = user?.role || 'manager';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white shadow-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <h1 className="text-lg font-semibold text-gray-800">Admin Panel</h1>
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg hover:bg-gray-100 text-red-600"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-gray-200">
          <div className="flex items-center justify-center h-16 border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-800">Admin Panel</h1>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left bg-blue-50 text-blue-700"
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Employee Management</span>
            </button>
          </nav>

          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg mb-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
                <p className="text-xs text-gray-500 capitalize">{displayRole}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40">
            <div 
              className="absolute inset-0 bg-black/50"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl">
              <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
                <h1 className="text-lg font-bold text-gray-800">Menu</h1>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <nav className="p-4 space-y-2">
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left bg-blue-50 text-blue-700"
                >
                  <Users className="w-5 h-5" />
                  <span className="font-medium">Employee Management</span>
                </button>
              </nav>
              
              <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-64">
          <div className="p-4 lg:p-6">
            <EmployeeManagement onViewEmployee={handleViewEmployee} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
