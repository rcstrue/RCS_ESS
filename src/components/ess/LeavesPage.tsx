import { useState, useEffect, useCallback } from 'react';
import {
  fetchLeaveBalance,
  fetchLeaves,
  applyLeave,
  approveLeave,
} from '@/lib/ess-api';
import type { LeaveRequest, LeaveBalance } from '@/lib/ess-types';
import { LEAVE_TYPES } from '@/lib/ess-types';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus,
  CalendarDays,
  Leaf,
  Clock,
  XCircle,
  CheckCircle2,
  X,
  Users,
  AlertTriangle,
} from 'lucide-react';

// ─── Props ───────────────────────────────────────────────────────────
interface LeavesPageProps {
  employeeId: string | number;
  employeeName: string;
  role: string;
  canApprove: boolean;
}

// ─── Leave type colors ──────────────────────────────────────────────
const LEAVE_TYPE_COLORS: Record<string, { badgeClass: string; progressColor: string }> = {
  CL: { badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200', progressColor: '[&>div]:bg-emerald-500' },
  SL: { badgeClass: 'bg-rose-100 text-rose-800 border-rose-200', progressColor: '[&>div]:bg-rose-500' },
  EL: { badgeClass: 'bg-amber-100 text-amber-800 border-amber-200', progressColor: '[&>div]:bg-amber-500' },
  WFH: { badgeClass: 'bg-sky-100 text-sky-800 border-sky-200', progressColor: '[&>div]:bg-sky-500' },
  Comp_Off: { badgeClass: 'bg-violet-100 text-violet-800 border-violet-200', progressColor: '[&>div]:bg-violet-500' },
  LWP: { badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', progressColor: '[&>div]:bg-slate-500' },
};

// ─── Status colors ──────────────────────────────────────────────────
const LEAVE_STATUS_COLORS: Record<string, { badgeClass: string; label: string }> = {
  pending: { badgeClass: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Pending' },
  approved: { badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Approved' },
  rejected: { badgeClass: 'bg-rose-100 text-rose-800 border-rose-200', label: 'Rejected' },
  cancelled: { badgeClass: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Cancelled' },
};

// ─── Helpers ─────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function calculateDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const diffTime = Math.abs(e.getTime() - s.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1; // inclusive of both dates
}

function getLeaveTypeLabel(type: string): string {
  return LEAVE_TYPES.find((t) => t.value === type)?.label ?? type;
}

// ─── Component ───────────────────────────────────────────────────────
export default function LeavesPage({
  employeeId,
  employeeName,
  role,
  canApprove,
}: LeavesPageProps) {
  // Balance
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(true);

  // My requests
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [myRequestsLoading, setMyRequestsLoading] = useState(true);

  // Pending team requests
  const [pendingTeamRequests, setPendingTeamRequests] = useState<LeaveRequest[]>([]);
  const [teamRequestsLoading, setTeamRequestsLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState('balance');

  // Apply leave dialog
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applyForm, setApplyForm] = useState({
    type: '',
    start_date: '',
    end_date: '',
    reason: '',
  });
  const [applyLoading, setApplyLoading] = useState(false);

  // Reject dialog
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ id: number; type: 'team' | 'self' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  // ─── Fetch data ──────────────────────────────────────────────
  const loadBalances = useCallback(async () => {
    try {
      setBalanceLoading(true);
      const res = await fetchLeaveBalance(employeeId);
      setBalances(res ?? []);
    } catch {
      toast.error('Failed to load leave balance');
    } finally {
      setBalanceLoading(false);
    }
  }, [employeeId]);

  const loadMyRequests = useCallback(async () => {
    try {
      setMyRequestsLoading(true);
      const res = await fetchLeaves(employeeId);
      setMyRequests(res?.items ?? []);
    } catch {
      toast.error('Failed to load leave requests');
    } finally {
      setMyRequestsLoading(false);
    }
  }, [employeeId]);

  const loadPendingTeamRequests = useCallback(async () => {
    if (!canApprove) return;
    try {
      setTeamRequestsLoading(true);
      const res = await fetchLeaves(employeeId, 'pending');
      setPendingTeamRequests(res?.items ?? []);
    } catch {
      toast.error('Failed to load team leave requests');
    } finally {
      setTeamRequestsLoading(false);
    }
  }, [employeeId, canApprove]);

  useEffect(() => {
    loadBalances();
    loadMyRequests();
  }, [loadBalances, loadMyRequests]);

  useEffect(() => {
    if (activeTab === 'approve') {
      loadPendingTeamRequests();
    }
  }, [activeTab, loadPendingTeamRequests]);

  // ─── Refresh all ─────────────────────────────────────────────
  const refreshAll = () => {
    loadBalances();
    loadMyRequests();
    if (canApprove && activeTab === 'approve') {
      loadPendingTeamRequests();
    }
  };

  // ─── Apply leave ─────────────────────────────────────────────
  const handleApplyLeave = async () => {
    if (!applyForm.type || !applyForm.start_date || !applyForm.end_date) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!applyForm.reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    if (applyForm.end_date < applyForm.start_date) {
      toast.error('End date cannot be before start date');
      return;
    }

    try {
      setApplyLoading(true);
      const days = calculateDays(applyForm.start_date, applyForm.end_date);
      await applyLeave({
        employee_id: employeeId,
        type: applyForm.type,
        start_date: applyForm.start_date,
        end_date: applyForm.end_date,
        days,
        reason: applyForm.reason.trim(),
      });
      toast.success('Leave request submitted successfully');
      setApplyDialogOpen(false);
      setApplyForm({ type: '', start_date: '', end_date: '', reason: '' });
      refreshAll();
    } catch {
      toast.error('Failed to submit leave request');
    } finally {
      setApplyLoading(false);
    }
  };

  // ─── Cancel own request ──────────────────────────────────────
  const handleCancelLeave = async (id: number) => {
    try {
      await approveLeave(id, 'cancelled', employeeId);
      toast.success('Leave request cancelled');
      refreshAll();
    } catch {
      toast.error('Failed to cancel leave request');
    }
  };

  // ─── Approve team leave ──────────────────────────────────────
  const handleApprove = async (id: number) => {
    try {
      await approveLeave(id, 'approved', employeeId);
      toast.success('Leave request approved');
      loadPendingTeamRequests();
      loadMyRequests(); // refresh in case it's relevant
    } catch {
      toast.error('Failed to approve leave request');
    }
  };

  // ─── Reject (opens dialog) ──────────────────────────────────
  const openRejectDialog = (id: number, type: 'team' | 'self') => {
    setRejectTarget({ id, type });
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    try {
      setRejectLoading(true);
      await approveLeave(rejectTarget.id, 'rejected', employeeId, rejectReason.trim());
      toast.success('Leave request rejected');
      setRejectDialogOpen(false);
      setRejectTarget(null);
      refreshAll();
    } catch {
      toast.error('Failed to reject leave request');
    } finally {
      setRejectLoading(false);
    }
  };

  // Auto-calculated days for apply form
  const calculatedDays =
    applyForm.start_date && applyForm.end_date && applyForm.end_date >= applyForm.start_date
      ? calculateDays(applyForm.start_date, applyForm.end_date)
      : 0;

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="balance" className="gap-1.5 text-xs sm:text-sm">
            <Leaf className="h-3.5 w-3.5 hidden sm:block" />
            Balance
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-1.5 text-xs sm:text-sm">
            <CalendarDays className="h-3.5 w-3.5 hidden sm:block" />
            My Requests
          </TabsTrigger>
          {canApprove && (
            <TabsTrigger value="approve" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5 hidden sm:block" />
              Approve
              {pendingTeamRequests.length > 0 && (
                <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  {pendingTeamRequests.length}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ═══════════ BALANCE TAB ═══════════ */}
        <TabsContent value="balance" className="mt-4">
          {balanceLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : balances.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Leaf className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No leave balance data available</p>
                <p className="text-xs mt-1">Contact HR if you think this is an error</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {balances.map((b) => {
                const colors = LEAVE_TYPE_COLORS[b.leave_type] ?? LEAVE_TYPE_COLORS.LWP;
                const pct = b.total > 0 ? Math.min((b.used / b.total) * 100, 100) : 0;

                return (
                  <Card key={b.id} className="overflow-hidden">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-center justify-between mb-3">
                        <Badge className={`text-[10px] sm:text-xs ${colors.badgeClass}`} variant="outline">
                          {b.leave_type}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground mb-3">
                        {getLeaveTypeLabel(b.leave_type)}
                      </p>

                      <div className="space-y-1 mb-3">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Used</span>
                          <span className="font-semibold">{b.used}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Balance</span>
                          <span className="font-semibold text-emerald-600">{b.balance}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-semibold">{b.total}</span>
                        </div>
                      </div>

                      <Progress
                        value={pct}
                        className={`h-2 ${colors.progressColor}`}
                      />
                      <p className="text-[10px] text-muted-foreground text-right mt-1">
                        {pct.toFixed(0)}% used
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════════ MY REQUESTS TAB ═══════════ */}
        <TabsContent value="requests" className="mt-4">
          {/* Apply button */}
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setApplyDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Apply Leave
            </Button>
          </div>

          {myRequestsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : myRequests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No leave requests found</p>
                <p className="text-xs mt-1">Tap "Apply Leave" to submit a new request</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {myRequests.map((req) => {
                const statusCfg = LEAVE_STATUS_COLORS[req.status] ?? LEAVE_STATUS_COLORS.pending;
                const typeColors = LEAVE_TYPE_COLORS[req.type] ?? LEAVE_TYPE_COLORS.LWP;

                return (
                  <Card key={req.id} className="overflow-hidden">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${typeColors.badgeClass}`} variant="outline">
                            {req.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {getLeaveTypeLabel(req.type)}
                          </span>
                        </div>
                        <Badge className={`text-xs shrink-0 ${statusCfg.badgeClass}`} variant="outline">
                          {statusCfg.label}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-sm mb-2">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          <span>
                            {formatShortDate(req.start_date)}
                            {req.start_date !== req.end_date && ` – ${formatShortDate(req.end_date)}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{req.days} {req.days === 1 ? 'day' : 'days'}</span>
                        </div>
                      </div>

                      {req.reason && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {req.reason}
                        </p>
                      )}

                      {req.status === 'pending' && (
                        <div className="flex justify-end mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1 text-xs"
                            onClick={() => handleCancelLeave(req.id)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        </div>
                      )}

                      {req.status === 'rejected' && req.rejection_reason && (
                        <div className="mt-2 rounded-md bg-rose-50 border border-rose-100 p-2">
                          <p className="text-xs font-medium text-rose-700">Rejection Reason:</p>
                          <p className="text-xs text-rose-600">{req.rejection_reason}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════════ APPROVE TAB ═══════════ */}
        {canApprove && (
          <TabsContent value="approve" className="mt-4">
            {teamRequestsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-xl" />
                ))}
              </div>
            ) : pendingTeamRequests.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No pending leave requests</p>
                  <p className="text-xs mt-1">All caught up!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pendingTeamRequests.map((req) => {
                  const typeColors = LEAVE_TYPE_COLORS[req.type] ?? LEAVE_TYPE_COLORS.LWP;

                  return (
                    <Card key={req.id} className="overflow-hidden border-amber-200 border-l-4">
                      <CardContent className="p-3 sm:p-4">
                        {/* Employee name & unit */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-semibold text-sm">{req.employee_name ?? 'Unknown'}</p>
                            {req.employee_unit && (
                              <p className="text-xs text-muted-foreground">{req.employee_unit}</p>
                            )}
                          </div>
                          <Badge className={`text-xs shrink-0 ${typeColors.badgeClass}`} variant="outline">
                            {req.type}
                          </Badge>
                        </div>

                        {/* Dates & days */}
                        <div className="flex items-center gap-3 text-sm mb-2">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            <span>
                              {formatShortDate(req.start_date)}
                              {req.start_date !== req.end_date && ` – ${formatShortDate(req.end_date)}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{req.days} {req.days === 1 ? 'day' : 'days'}</span>
                          </div>
                        </div>

                        {/* Reason */}
                        {req.reason && (
                          <p className="text-xs text-muted-foreground mb-3 bg-muted/50 rounded p-2">
                            {req.reason}
                          </p>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 text-xs"
                            onClick={() => openRejectDialog(req.id, 'team')}
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                            onClick={() => handleApprove(req.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ═══════════ APPLY LEAVE DIALOG ═══════════ */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Apply Leave
            </DialogTitle>
            <DialogDescription>
              Submit a new leave request for approval.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Leave type */}
            <div className="space-y-2">
              <Label htmlFor="leave-type">Leave Type *</Label>
              <Select
                value={applyForm.type}
                onValueChange={(v) => setApplyForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger id="leave-type">
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((lt) => (
                    <SelectItem key={lt.value} value={lt.value}>
                      {lt.label} ({lt.value})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date *</Label>
                <input
                  id="start-date"
                  type="date"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={applyForm.start_date}
                  onChange={(e) =>
                    setApplyForm((f) => ({ ...f, start_date: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date *</Label>
                <input
                  id="end-date"
                  type="date"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={applyForm.end_date}
                  min={applyForm.start_date}
                  onChange={(e) =>
                    setApplyForm((f) => ({ ...f, end_date: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Auto-calculated days */}
            {calculatedDays > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Total days:{' '}
                  <span className="font-semibold text-foreground">{calculatedDays}</span>
                </span>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="leave-reason">Reason *</Label>
              <Textarea
                id="leave-reason"
                placeholder="Enter reason for leave..."
                value={applyForm.reason}
                onChange={(e) =>
                  setApplyForm((f) => ({ ...f, reason: e.target.value }))
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApplyDialogOpen(false)}
              disabled={applyLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyLeave}
              disabled={applyLoading || !applyForm.type || !applyForm.start_date || !applyForm.end_date}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {applyLoading ? (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 animate-spin" />
                  Submitting...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Submit Request
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ REJECT DIALOG ═══════════ */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              Reject Leave Request
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this leave request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Rejection Reason *</Label>
              <Textarea
                id="reject-reason"
                placeholder="Enter reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejectLoading}
            >
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={rejectLoading || !rejectReason.trim()}
            >
              {rejectLoading ? (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 animate-spin" />
                  Rejecting...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" />
                  Confirm Reject
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
