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
  CreditCard,
  Heart,
  Hash,
  UsersRound,
  FileText,
  Clock,
  Eye,
  EyeOff,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { getFileUrl } from '@/lib/api/config';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import {
  fetchEmployees,
  fetchEmployeeById,
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
  // Show full mobile number — no masking
  return mobile || '';
}

function maskSensitive(value: string | number | undefined): string {
  const str = value != null ? String(value) : '';
  if (!str) return '****';
  if (str.length <= 4) return '****';
  const first = str.slice(0, 2);
  const last = str.slice(-2);
  const middleLen = str.length - 4;
  return first + '*'.repeat(middleLen) + last;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedOnce, setSearchedOnce] = useState(false); // track if user has searched
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
  const [profileLoading, setProfileLoading] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; title: string } | null>(null);

  // ── Load filter options ──
  const loadFilters = useCallback(async () => {
    setFiltersLoading(true);
    try {
      const [clientsResult, unitsResult] = await Promise.all([
        fetchClients(scope, employeeId),
        fetchUnits(scope, employeeId),
      ]);
      const clientsRes = clientsResult?.data;
      const unitsRes = unitsResult?.data;
      setClients(Array.isArray(clientsRes) ? clientsRes : []);
      setUnits(Array.isArray(unitsRes) ? unitsRes : []);
    } catch (err) {
      console.error('Failed to load filters:', err);
    } finally {
      setFiltersLoading(false);
    }
  }, [scope, employeeId]);

  // ── Load employees (only after user applies a filter or search) ──
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearchedOnce(true);
    try {
      const { data: res, error: fetchError } = await fetchEmployees({
        scope,
        requester_id: employeeId,
        page,
        limit: PAGE_SIZE,
        q: searchQuery || undefined,
        client_id: selectedClient ? Number(selectedClient) : undefined,
        unit_id: selectedUnit ? Number(selectedUnit) : undefined,
      });
      if (fetchError) {
        toast.error(fetchError);
        return;
      }
      setEmployees(res?.items ?? []);
      setTotal(res?.pagination?.total ?? 0);
      setTotalPages(res?.pagination?.total_pages ?? Math.ceil((res?.pagination?.total ?? 0) / PAGE_SIZE));
    } catch (err) {
      console.error('Failed to fetch employees:', err);
      setError('Failed to load directory. Please try again.');
      toast.error('Failed to load employee directory');
    } finally {
      setLoading(false);
    }
  }, [scope, employeeId, page, searchQuery, selectedClient, selectedUnit]);

  // Pull-to-refresh (after loadEmployees is defined to avoid TDZ)
  const pullRefresh = usePullToRefresh<HTMLDivElement>({
    onRefresh: loadEmployees,
  });

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  // Only load employees when user actually searches or filters (not on mount)
  const hasSearchOrFilter = searchQuery || (selectedClient && selectedClient !== 'all_clients') || (selectedUnit && selectedUnit !== 'all_units');
  const filterKey = `${searchQuery}|${selectedClient}|${selectedUnit}|${page}`;
  useEffect(() => {
    if (hasSearchOrFilter) {
      loadEmployees();
    }
  }, [filterKey]);

  // Reset page when search/filter changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedClient, selectedUnit]);

  // ── Filtered units by selected client ──
  const filteredUnits = useMemo(() => {
    if (!selectedClient) return units;
    return units.filter((u) => u.client_id === Number(selectedClient) || !u.client_id);
  }, [units, selectedClient]);

  // ── Clear filters ──
  const clearFilters = () => {
    setSearchQuery('');
    setSearchInput('');
    setSelectedClient('');
    setSelectedUnit('');
  };

  const hasActiveFilters = searchQuery || (selectedClient && selectedClient !== 'all_clients') || (selectedUnit && selectedUnit !== 'all_units');

  // ── Open profile dialog with full details ──
  const openProfile = async (emp: Employee) => {
    setSelectedEmployee(emp);
    setProfileOpen(true);
    setProfileLoading(true);
    try {
      const { data: fullEmp } = await fetchEmployeeById(emp.id);
      if (fullEmp) {
        setSelectedEmployee(fullEmp);
      }
    } catch (err) {
      console.error('Failed to fetch full employee details:', err);
      // Keep the basic data from the list
    } finally {
      setProfileLoading(false);
    }
  };

  const emp = selectedEmployee;

  // Pull-to-refresh wrapper props
  const pullRefreshProps = {
    ref: pullRefresh.containerRef,
    onTouchStart: pullRefresh.handleTouchStart,
    onTouchMove: pullRefresh.handleTouchMove,
    onTouchEnd: pullRefresh.handleTouchEnd,
  };

  // ── Render ──
  return (
    <div {...pullRefreshProps} className="flex flex-col gap-4 pb-6" style={{ touchAction: 'pan-y' }}>
      {/* Pull-to-refresh indicator */}
      <div style={pullRefresh.pullIndicatorStyle} className="flex items-center justify-center">
        <Loader2 className={cn("h-5 w-5 text-primary", (pullRefresh.isRefreshing || pullRefresh.pullDistance > 20) && "animate-spin")} />
      </div>
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">Directory</h2>
        <p className="text-sm text-muted-foreground">
          {searchedOnce && total > 0 ? `${total} employee${total > 1 ? 's' : ''} found` :
           searchedOnce && total === 0 ? 'No employees found' :
           'Search employees by name, client, or unit'}
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
              &ldquo;{searchQuery}&rdquo;
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
      ) : !searchedOnce ? (
        /* ── Prompt to search before showing results ── */
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <Search className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-muted-foreground">Search Employees</p>
            <p className="text-sm text-muted-foreground/70">
              Enter a name or employee code, or select a client/unit to find employees
            </p>
          </div>
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-muted-foreground">No employees found</p>
            <p className="text-sm text-muted-foreground/70">
              Try adjusting your search or filters
            </p>
          </div>
          <Button variant="outline" size="sm" className="mt-1" onClick={clearFilters}>
            Clear Filters
          </Button>
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
                    <AvatarImage src={getFileUrl(emp.profile_pic_url) || undefined} alt={emp.full_name} />
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

      {/* ── Profile Dialog (Full Detail) ── */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md p-0">
          <DialogTitle className="sr-only">Employee Profile — {emp?.full_name || 'Employee'}</DialogTitle>
          {emp && (
            <>
              {profileLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Header with avatar */}
                  <div className="flex flex-col items-center gap-3 pt-6 pb-4 px-4">
                    <div className="relative">
                      <Avatar className="h-20 w-20 border-2 border-primary/20">
                        <AvatarImage src={getFileUrl(emp.profile_pic_cropped_url || emp.profile_pic_url) || undefined} alt={emp.full_name} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                          {getInitials(emp.full_name || 'U')}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          'absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-background',
                          isActive(emp) ? 'bg-emerald-500' : 'bg-slate-400'
                        )}
                      />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold">{emp.full_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {emp.employee_code || `EMP-${emp.id}`}
                      </p>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            isActive(emp)
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          )}
                        >
                          {isActive(emp) ? 'Active' : 'Inactive'}
                        </Badge>
                        {emp.designation && (
                          <Badge variant="secondary" className="text-[10px]">
                            {emp.designation}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pb-6 space-y-4">
                    {/* Personal Information */}
                    <ProfileSection title="Personal">
                      <ProfileRow icon={User} label="Father/Husband Name" value={emp.father_name} />
                      <ProfileRow icon={Calendar} label="Date of Birth" value={emp.date_of_birth ? formatDate(emp.date_of_birth) : undefined} />
                      <ProfileRow icon={User} label="Gender" value={emp.gender} />
                      <ProfileRow icon={Heart} label="Marital Status" value={emp.marital_status} />
                      <ProfileRow icon={Heart} label="Blood Group" value={emp.blood_group} />
                    </ProfileSection>

                    {/* Contact */}
                    <ProfileSection title="Contact">
                      <ProfileRow icon={Phone} label="Mobile" value={emp.mobile_number ? maskMobile(emp.mobile_number) : undefined} />
                      <SensitiveProfileRow icon={Phone} label="Alternate Mobile" value={emp.alternate_mobile} />
                      <ProfileRow icon={Mail} label="Email" value={emp.email} />
                      <ProfileRow icon={MapPin} label="Address" value={emp.address} />
                      <ProfileRow
                        icon={MapPin}
                        label="Location"
                        value={[emp.city, emp.district, emp.state].filter(Boolean).join(', ') || undefined}
                      />
                      <ProfileRow icon={Hash} label="PIN Code" value={emp.pin_code} />
                    </ProfileSection>

                    {/* Employment */}
                    <ProfileSection title="Employment">
                      <ProfileRow
                        icon={Building2}
                        label="Client / Unit"
                        value={[emp.client_name, emp.unit_name].filter(Boolean).join(' / ') || undefined}
                      />
                      <ProfileRow icon={Building2} label="Department" value={emp.department} />
                      <ProfileRow icon={Briefcase} label="Employment Type" value={emp.employment_type} />
                      <ProfileRow icon={Shield} label="Worker Category" value={emp.worker_category} />
                      <ProfileRow icon={IdCard} label="Role" value={emp.employee_role} />
                      <ProfileRow icon={Clock} label="Date of Joining" value={emp.date_of_joining ? formatDate(emp.date_of_joining) : undefined} />
                      <ProfileRow icon={Calendar} label="Confirmation Date" value={emp.confirmation_date ? formatDate(emp.confirmation_date) : undefined} />
                      <ProfileRow icon={Clock} label="Probation Period" value={emp.probation_period ? `${emp.probation_period} months` : undefined} />
                      <ProfileRow icon={Calendar} label="Date of Leaving" value={emp.date_of_leaving ? formatDate(emp.date_of_leaving) : undefined} />
                    </ProfileSection>

                    {/* Government IDs — always show section */}
                    <ProfileSection title="Government IDs">
                      <SensitiveProfileRow icon={IdCard} label="Aadhaar Number" value={emp.aadhaar_number} />
                      <SensitiveProfileRow icon={Hash} label="UAN Number" value={emp.uan_number} />
                      <SensitiveProfileRow icon={Hash} label="ESIC Number" value={emp.esic_number} />
                    </ProfileSection>

                    {/* Bank Details — always show section */}
                    <ProfileSection title="Bank Details">
                      <ProfileRow icon={CreditCard} label="Bank Name" value={emp.bank_name} />
                      <ProfileRow icon={User} label="Account Holder" value={emp.account_holder_name} />
                      <SensitiveProfileRow icon={CreditCard} label="Account Number" value={emp.account_number} />
                      <SensitiveProfileRow icon={Hash} label="IFSC Code" value={emp.ifsc_code} />
                    </ProfileSection>

                    {/* Emergency Contact — always show section */}
                    <ProfileSection title="Emergency Contact">
                      <ProfileRow icon={UsersRound} label="Contact Name" value={emp.emergency_contact_name} />
                      <ProfileRow icon={UsersRound} label="Relation" value={emp.emergency_contact_relation} />
                    </ProfileSection>

                    {/* Nominee — always show section */}
                    <ProfileSection title="Nominee">
                      <ProfileRow icon={UsersRound} label="Nominee Name" value={emp.nominee_name} />
                      <ProfileRow icon={UsersRound} label="Relationship" value={emp.nominee_relationship} />
                      <ProfileRow icon={Calendar} label="Nominee DOB" value={emp.nominee_dob ? formatDate(emp.nominee_dob) : undefined} />
                      <SensitiveProfileRow icon={Phone} label="Nominee Contact" value={emp.nominee_contact} />
                    </ProfileSection>

                    {/* Documents — always show section */}
                    <ProfileSection title="Documents">
                      {emp.aadhaar_front_url ? (
                        <DocThumbnail
                          label="Aadhaar Front"
                          url={getFileUrl(emp.aadhaar_front_url)}
                          onClick={() => setViewingDoc({ url: getFileUrl(emp.aadhaar_front_url), title: 'Aadhaar Front' })}
                        />
                      ) : (
                        <ProfileRow icon={FileText} label="Aadhaar Front" value={undefined} />
                      )}
                      {emp.aadhaar_back_url ? (
                        <DocThumbnail
                          label="Aadhaar Back"
                          url={getFileUrl(emp.aadhaar_back_url)}
                          onClick={() => setViewingDoc({ url: getFileUrl(emp.aadhaar_back_url), title: 'Aadhaar Back' })}
                        />
                      ) : (
                        <ProfileRow icon={FileText} label="Aadhaar Back" value={undefined} />
                      )}
                      {emp.bank_document_url ? (
                        <DocThumbnail
                          label="Bank Document"
                          url={getFileUrl(emp.bank_document_url)}
                          onClick={() => setViewingDoc({ url: getFileUrl(emp.bank_document_url), title: 'Bank Document' })}
                        />
                      ) : (
                        <ProfileRow icon={FileText} label="Bank Document" value={undefined} />
                      )}
                    </ProfileSection>
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Document Viewer Dialog ── */}
      <Dialog open={!!viewingDoc} onOpenChange={() => setViewingDoc(null)}>
        <DialogContent className="sm:max-w-lg p-0">
          <DialogHeader className="p-3 border-b">
            <DialogTitle className="text-sm">{viewingDoc?.title}</DialogTitle>
          </DialogHeader>
          <div className="p-2">
            {viewingDoc?.url && (
              <img
                src={viewingDoc.url}
                alt={viewingDoc.title}
                className="w-full rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Profile Section ────────────────────────────────────
function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">{title}</h4>
      <div className="space-y-2">{children}</div>
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
  value?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("text-sm font-medium", !value && "text-muted-foreground/50 italic")}>
          {value || '—'}
        </span>
      </div>
    </div>
  );
}

// ── Sensitive Profile Row (with eye toggle) ──────────
function SensitiveProfileRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value?: string | number;
}) {
  const [revealed, setRevealed] = useState(false);
  const displayValue = value != null ? String(value) : '';

  if (!displayValue) {
    return (
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-sm font-medium text-muted-foreground/50 italic">—</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium font-mono">
          {revealed ? displayValue : maskSensitive(displayValue)}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="mt-0.5 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
        aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── Document Thumbnail ──────────────────────────────────
function DocThumbnail({
  label,
  url,
  onClick,
}: {
  label: string;
  url: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-2 rounded-lg border hover:bg-accent/30 transition-colors text-left w-full"
    >
      <img
        src={url}
        alt={label}
        className="h-10 w-14 rounded object-cover border"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Eye className="h-3 w-3" /> Tap to view
        </p>
      </div>
    </button>
  );
}
