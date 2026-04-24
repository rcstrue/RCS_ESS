import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Search,
  Users,
  Phone,
  Building2,
  Briefcase,
  MapPin,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Mail,
  Calendar,
  User,
  Shield,
  IdCard,
  Inbox,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  fetchEmployees,
  fetchClients,
  fetchUnits,
} from '@/lib/ess-api';
import type { Employee, ClientOption, UnitOption } from '@/lib/ess-types';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Props ──────────────────────────────────────────────
interface DirectoryPageProps {
  employeeId: number;
  role: string;
  scope: string;
}

// ── Constants ──────────────────────────────────────────
const PAGE_SIZE = 20;

// ── Helpers ────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function maskMobile(mobile: string): string {
  if (!mobile || mobile.length < 5) return mobile;
  // Format: 98XXX XXXXX (first 2 visible, rest masked)
  return `${mobile.slice(0, 2)}XXX XXX${mobile.length > 9 ? 'X' : ''}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isActive(employee: Employee): boolean {
  return !employee.date_of_leaving && employee.status !== 'inactive' && employee.status !== 'resigned';
}

// ── Component ──────────────────────────────────────────
export default function DirectoryPage({
  employeeId,
  role,
  scope,
}: DirectoryPageProps) {
  // ── State ──
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');

  // Filter options
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(true);

  // Profile dialog
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // ── Load filter options ──
  const loadFilters = useCallback(async () => {
    setFiltersLoading(true);
    try {
      const [clientsRes, unitsRes] = await Promise.all([
        fetchClients(scope, employeeId),
        fetchUnits(scope, employeeId),
      ]);
      setClients(Array.isArray(clientsRes) ? clientsRes : []);
      setUnits(Array.isArray(unitsRes) ? unitsRes : []);
    } catch (err) {
      console.error('Failed to load filters:', err);
    } finally {
      setFiltersLoading(false);
    }
  }, [scope, employeeId]);

  // ── Load employees ──
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEmployees({
        scope,
        requester_id: employeeId,
        page,
        limit: PAGE_SIZE,
        q: searchQuery || undefined,
        client_id: selectedClient ? Number(selectedClient) : undefined,
        unit_id: selectedUnit ? Number(selectedUnit) : undefined,
      });
      setEmployees(res.items ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.total_pages ?? Math.ceil((res.pagination?.total ?? 0) / PAGE_SIZE));
    } catch (err) {
      console.error('Failed to fetch employees:', err);
      setError('Failed to load directory. Please try again.');
      toast.error('Failed to load employee directory');
    } finally {
      setLoading(false);
    }
  }, [scope, employeeId, page, searchQuery, selectedClient, selectedUnit]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedClient, selectedUnit]);

  // ── Filtered units by selected client ──
  const filteredUnits = useMemo(() => {
    if (!selectedClient || selectedClient === 'all_clients') return units;
    return units.filter((u) => Number(u.client_id) === Number(selectedClient) || !u.client_id);
  }, [units, selectedClient]);

  // ── Clear filters ──
  const clearFilters = () => {
    setSearchQuery('');
    setSearchInput('');
    setSelectedClient('');
    setSelectedUnit('');
  };

  const hasActiveFilters = searchQuery || selectedClient || selectedUnit;

  // ── Open profile dialog ──
  const openProfile = (emp: Employee) => {
    setSelectedEmployee(emp);
    setProfileOpen(true);
  };

  // ── Render ──
  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">Directory</h2>
        <p className="text-sm text-muted-foreground">
          {total > 0 ? `${total} employee${total > 1 ? 's' : ''} found` : 'Search the employee directory'}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or employee code..."
          className="pl-9 pr-9"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setSearchQuery(searchInput.trim());
            }
          }}
        />
        {searchInput && (
          <button
            onClick={() => { setSearchInput(''); setSearchQuery(''); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter dropdowns */}
      <div className="grid grid-cols-2 gap-2">
        <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setSelectedUnit(''); }}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={filtersLoading ? 'Loading...' : 'All Clients'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_clients">All Clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedUnit} onValueChange={setSelectedUnit}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={filtersLoading ? 'Loading...' : 'All Units'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_units">All Units</SelectItem>
            {filteredUnits.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Active filters indicator */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {searchQuery && (
            <Badge variant="secondary" className="gap-1 text-xs">
              "{searchQuery}"
              <button onClick={() => { setSearchQuery(''); setSearchInput(''); }}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedClient && selectedClient !== 'all_clients' && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {clients.find((c) => String(c.id) === selectedClient)?.name || 'Client'}
              <button onClick={() => setSelectedClient('')}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedUnit && selectedUnit !== 'all_units' && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {filteredUnits.find((u) => String(u.id) === selectedUnit)?.name || 'Unit'}
              <button onClick={() => setSelectedUnit('')}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <button
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={loadEmployees}>
            Retry
          </Button>
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-muted-foreground">No employees found</p>
            <p className="text-sm text-muted-foreground/70">
              {hasActiveFilters
                ? 'Try adjusting your search or filters'
                : 'No employees available in your directory'}
            </p>
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" className="mt-1" onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Employee list */}
          <div className="flex flex-col gap-2">
            {employees.map((emp) => (
              <button
                key={emp.id}
                onClick={() => openProfile(emp)}
                className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/30 w-full"
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={emp.profile_pic_url} alt={emp.full_name} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {getInitials(emp.full_name || 'U')}
                    </AvatarFallback>
                  </Avatar>
                  {/* Status dot */}
                  {isActive(emp) && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{emp.full_name}</p>
                    {!isActive(emp) && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 border-slate-200 shrink-0">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  {emp.designation && (
                    <p className="text-xs text-muted-foreground truncate">{emp.designation}</p>
                  )}
                  <div className="flex items-center gap-3 mt-0.5">
                    {(emp.client_name || emp.unit_name) && (
                      <span className="text-xs text-muted-foreground/80 truncate">
                        {[emp.client_name, emp.unit_name].filter(Boolean).join(' / ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Mobile */}
                {emp.mobile_number && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <Phone className="h-3 w-3" />
                    <span>{maskMobile(emp.mobile_number)}</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{page}</span>
                <span>of</span>
                <span className="font-medium text-foreground">{totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Profile Dialog ── */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {selectedEmployee && (
            <>
              <DialogHeader>
                <DialogTitle className="text-center">Employee Profile</DialogTitle>
              </DialogHeader>

              <div className="flex flex-col items-center gap-4 py-2">
                {/* Avatar + Status */}
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={selectedEmployee.profile_pic_url} alt={selectedEmployee.full_name} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                      {getInitials(selectedEmployee.full_name || 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      'absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-background',
                      isActive(selectedEmployee) ? 'bg-emerald-500' : 'bg-slate-400'
                    )}
                  />
                </div>

                {/* Name + Code */}
                <div className="text-center">
                  <h3 className="text-lg font-bold">{selectedEmployee.full_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedEmployee.employee_code || `EMP-${selectedEmployee.id}`}
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      'mt-1',
                      isActive(selectedEmployee)
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    )}
                  >
                    {isActive(selectedEmployee) ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Details */}
              <div className="space-y-3 text-sm">
                {selectedEmployee.designation && (
                  <ProfileRow icon={Briefcase} label="Designation" value={selectedEmployee.designation} />
                )}
                {selectedEmployee.department && (
                  <ProfileRow icon={Building2} label="Department" value={selectedEmployee.department} />
                )}
                {(selectedEmployee.client_name || selectedEmployee.unit_name) && (
                  <ProfileRow
                    icon={Building2}
                    label="Client / Unit"
                    value={[selectedEmployee.client_name, selectedEmployee.unit_name].filter(Boolean).join(' / ')}
                  />
                )}
                {selectedEmployee.employment_type && (
                  <ProfileRow icon={User} label="Employment Type" value={selectedEmployee.employment_type} />
                )}
                {selectedEmployee.worker_category && (
                  <ProfileRow icon={Shield} label="Category" value={selectedEmployee.worker_category} />
                )}
                {selectedEmployee.mobile_number && (
                  <ProfileRow icon={Phone} label="Mobile" value={maskMobile(selectedEmployee.mobile_number)} />
                )}
                {selectedEmployee.email && (
                  <ProfileRow icon={Mail} label="Email" value={selectedEmployee.email} />
                )}
                {selectedEmployee.date_of_joining && (
                  <ProfileRow icon={Calendar} label="Date of Joining" value={formatDate(selectedEmployee.date_of_joining)} />
                )}
                {selectedEmployee.date_of_leaving && (
                  <ProfileRow icon={Calendar} label="Date of Leaving" value={formatDate(selectedEmployee.date_of_leaving)} />
                )}
                {selectedEmployee.employee_role && (
                  <ProfileRow icon={IdCard} label="Role" value={selectedEmployee.employee_role} />
                )}
                {selectedEmployee.city && (
                  <ProfileRow icon={MapPin} label="City" value={selectedEmployee.city} />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Profile Row ────────────────────────────────────────
function ProfileRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  );
}
