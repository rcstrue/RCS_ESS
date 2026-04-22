import { useState, useEffect, useCallback } from 'react';
import { getEmployees, getEmployeeById, approveEmployee, rejectEmployee, updateEmployeeRole, Employee } from '@/lib/api/employees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Check, X, Eye, Loader2, UserCog, Search, User, Filter } from 'lucide-react';
import { EmployeeDetailDialog } from './EmployeeDetailDialog';
import { getFileUrl } from '@/lib/api/config';

interface EmployeeManagementProps {
  userRole: string;
}

export function EmployeeManagement({ userRole }: EmployeeManagementProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<string>('employee');
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [clients, setClients] = useState<string[]>([]);

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await getEmployees(1, 100);

    if (error) {
      toast.error('Failed to fetch employees');
      console.error(error);
    } else {
      const employeeList = data?.data || [];
      setEmployees(employeeList);
      // Extract unique clients
      const uniqueClients = [...new Set(employeeList
        .map(e => e.client_name)
        .filter(Boolean) as string[])];
      setClients(uniqueClients);
    }
    setIsLoading(false);
  }, []);

  const filterEmployees = useCallback(() => {
    let filtered = [...employees];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.full_name?.toLowerCase().includes(query) ||
        e.mobile_number.includes(query) ||
        e.email?.toLowerCase().includes(query) ||
        e.aadhaar_number?.includes(query) ||
        String(e.employee_code).includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending_approval') {
        filtered = filtered.filter(e => e.manager_edits_pending);
      } else {
        filtered = filtered.filter(e => e.status === statusFilter);
      }
    }

    // Client filter
    if (clientFilter !== 'all') {
      filtered = filtered.filter(e => e.client_name === clientFilter);
    }

    setFilteredEmployees(filtered);
  }, [employees, searchQuery, statusFilter, clientFilter]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    filterEmployees();
  }, [filterEmployees]);

  const handleApprove = async (employeeId: number) => {
    setIsUpdating(true);
    const { error } = await approveEmployee(employeeId, 'admin');

    if (error) {
      toast.error('Failed to approve employee');
    } else {
      toast.success('Employee approved successfully');
      fetchEmployees();
    }
    setIsUpdating(false);
  };

  const handleReject = async (employeeId: number) => {
    setIsUpdating(true);
    const { error } = await rejectEmployee(employeeId);

    if (error) {
      toast.error('Failed to reject employee');
    } else {
      toast.success('Employee rejected');
      fetchEmployees();
    }
    setIsUpdating(false);
  };

  const handleRoleChange = async () => {
    if (!selectedEmployee) return;
    
    setIsUpdating(true);
    const { error } = await updateEmployeeRole(selectedEmployee.id, newRole as 'admin' | 'manager' | 'employee');

    if (error) {
      toast.error('Failed to update role');
    } else {
      toast.success(`Role updated to ${newRole}`);
      fetchEmployees();
      setIsRoleDialogOpen(false);
    }
    setIsUpdating(false);
  };

  const openRoleDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setNewRole(employee.employee_role || 'employee');
    setIsRoleDialogOpen(true);
  };

  const openDetailDialog = async (employee: Employee) => {
    // Fetch full employee details
    const { data: fullEmployee } = await getEmployeeById(employee.id);
    if (fullEmployee) {
      setSelectedEmployee(fullEmployee);
    } else {
      setSelectedEmployee(employee);
    }
    setIsDetailDialogOpen(true);
  };

  const getStatusBadge = (status: string | null, managerEdits: boolean | null) => {
    if (managerEdits) {
      return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Pending Admin Approval</Badge>;
    }
    switch (status) {
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">Pending HR</Badge>;
    }
  };

  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-purple-500">Admin</Badge>;
      case 'manager':
        return <Badge className="bg-blue-500">Manager</Badge>;
      default:
        return <Badge variant="secondary">Employee</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Employee Management
            <Badge variant="secondary" className="ml-2">{filteredEmployees.length} employees</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, mobile, email, code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending_hr_verification">Pending HR</SelectItem>
                <SelectItem value="pending_approval">Pending Admin</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map(client => (
                  <SelectItem key={client} value={client}>{client}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Client / Unit</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee) => (
                  <TableRow key={employee.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell onClick={() => openDetailDialog(employee)}>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={getFileUrl(employee.profile_pic_cropped_url || employee.profile_pic_url) || undefined} />
                          <AvatarFallback>
                            <User className="w-5 h-5" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{employee.full_name || 'N/A'}</p>
                          <p className="text-sm text-muted-foreground">
                            Code: {employee.employee_code}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell onClick={() => openDetailDialog(employee)}>
                      <div>
                        <p>{employee.mobile_number}</p>
                        <p className="text-sm text-muted-foreground">{employee.email || 'No email'}</p>
                      </div>
                    </TableCell>
                    <TableCell onClick={() => openDetailDialog(employee)}>
                      {employee.client_name && employee.unit_name ? (
                        <div>
                          <p className="font-medium">{employee.client_name}</p>
                          <p className="text-sm text-muted-foreground">{employee.unit_name}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell>{getRoleBadge(employee.employee_role)}</TableCell>
                    <TableCell>
                      {getStatusBadge(employee.status, employee.manager_edits_pending)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetailDialog(employee)}
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {userRole === 'admin' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openRoleDialog(employee)}
                            title="Change Role"
                          >
                            <UserCog className="w-4 h-4" />
                          </Button>
                        )}
                        {(employee.status === 'pending_hr_verification' || employee.manager_edits_pending) && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleApprove(employee.id)}
                              disabled={isUpdating}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReject(employee.id)}
                              disabled={isUpdating}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Reject"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredEmployees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No employees found</p>
                      {(searchQuery || statusFilter !== 'all' || clientFilter !== 'all') && (
                        <Button
                          variant="link"
                          onClick={() => {
                            setSearchQuery('');
                            setStatusFilter('all');
                            setClientFilter('all');
                          }}
                        >
                          Clear filters
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Role Change Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Employee Role</DialogTitle>
            <DialogDescription>
              Update role for {selectedEmployee?.full_name || selectedEmployee?.mobile_number}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRoleChange} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee Detail Dialog */}
      <EmployeeDetailDialog
        employee={selectedEmployee}
        isOpen={isDetailDialogOpen}
        onClose={() => setIsDetailDialogOpen(false)}
        onSave={fetchEmployees}
        userRole={userRole}
      />
    </>
  );
}
