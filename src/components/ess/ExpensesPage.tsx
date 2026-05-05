import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Loader2,
  Receipt,
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  Banknote,
  IndianRupee,
  CalendarDays,
  Check,
  X,
  Upload,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  fetchExpenses,
  createExpense,
  approveExpense,
  fetchPendingTeamExpenses,
  fetchExpenseTypes,
} from '@/lib/ess-api';
import { uploadFile, getFileUrl } from '@/lib/api/config';
import type { Expense } from '@/lib/ess-types';
import { EXPENSE_TYPES } from '@/lib/ess-types';

interface ExpensesPageProps {
  employeeId: number;
  employeeName: string;
  role: string;
  canApprove: boolean;
}

// ── Badge style maps ──
const TYPE_BADGE: Record<string, string> = {
  advance:
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  expense:
    'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
  reimbursed: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  reimbursed: 'Reimbursed',
};

const TYPE_LABEL: Record<string, string> = {
  advance: 'Advance',
  expense: 'Expense',
};

// ── Formatters ──
const formatCurrency = (amount: number | undefined | null): string => {
  const num = Number(amount);
  if (isNaN(num)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(
    new Date(dateStr).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
  );
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/** Get today's date string in IST for the max attribute */
const todayISTString = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** Get current month as YYYY-MM */
const currentMonthString = () => {
  const now = new Date();
  now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}`;
};

/** Format YYYY-MM to "Month Year" */
const formatMonthYear = (monthStr: string): string => {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

/** Navigate months: +1 or -1 */
const navigateMonth = (monthStr: string, direction: number): string => {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1 + direction, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

// ── Main component ──
export function ExpensesPage({
  employeeId,
  employeeName,
  role,
  canApprove,
}: ExpensesPageProps) {
  const [activeTab, setActiveTab] = useState('my');

  // My expenses
  const [myExpenses, setMyExpenses] = useState<Expense[]>([]);
  const [isLoadingMy, setIsLoadingMy] = useState(true);

  // Pending team expenses (for approve tab)
  const [pendingTeamExpenses, setPendingTeamExpenses] = useState<Expense[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);

  // Month filter
  const [selectedMonth, setSelectedMonth] = useState(currentMonthString());

  // Expense types (dynamic from DB)
  const [categories, setCategories] = useState<string[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<string[]>([]);

  // Submit dialog
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [submitCategory, setSubmitCategory] = useState<string>('');
  const [submitType, setSubmitType] = useState<string>('expense');
  const [submitAmount, setSubmitAmount] = useState('');
  const [submitDate, setSubmitDate] = useState(todayISTString());
  const [submitDescription, setSubmitDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bill upload
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billPreview, setBillPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reject dialog
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectExpenseId, setRejectExpenseId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Approve loading state
  const [approvingId, setApprovingId] = useState<number | null>(null);

  // ── Load my expenses ──
  const loadMyExpenses = useCallback(async () => {
    setIsLoadingMy(true);
    try {
      const { data, error } = await fetchExpenses(employeeId);
      if (error) {
        toast.error('Failed to load expenses');
      } else {
        setMyExpenses(data?.items ?? []);
      }
    } catch {
      toast.error('Something went wrong while loading expenses');
    } finally {
      setIsLoadingMy(false);
    }
  }, [employeeId]);

  // ── Load pending team expenses (single API call) ──
  const loadPendingTeamExpenses = useCallback(async () => {
    if (!canApprove) return;
    setIsLoadingTeam(true);
    try {
      const { data, error } = await fetchPendingTeamExpenses();
      if (error) {
        toast.error('Failed to load team expenses');
      } else {
        setPendingTeamExpenses(data?.items ?? []);
      }
    } catch {
      toast.error('Failed to load team expenses');
    } finally {
      setIsLoadingTeam(false);
    }
  }, [canApprove]);

  // ── Load expense types & categories from DB ──
  useEffect(() => {
    fetchExpenseTypes().then(({ data }) => {
      if (data) {
        setCategories(data.categories || []);
        setExpenseTypes(data.types || []);
        if (data.categories?.length && !submitCategory) {
          setSubmitCategory(data.categories[0]);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMyExpenses();
  }, [loadMyExpenses]);

  useEffect(() => {
    if (canApprove) {
      loadPendingTeamExpenses();
    }
  }, [canApprove, loadPendingTeamExpenses]);

  // ── Month-filtered expenses ──
  const monthExpenses = useMemo(() => {
    return myExpenses.filter((e) => {
      if (!e.expense_date) return false;
      return e.expense_date.startsWith(selectedMonth);
    });
  }, [myExpenses, selectedMonth]);

  // ── Summary for selected month ──
  const monthSummary = useMemo(() => {
    const totalAdvance = monthExpenses
      .filter((e) => e.type === 'advance' && (e.status === 'approved' || e.status === 'reimbursed'))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const totalExpense = monthExpenses
      .filter((e) => e.type === 'expense' && (e.status === 'approved' || e.status === 'reimbursed'))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const totalPending = monthExpenses
      .filter((e) => e.status === 'pending')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const balance = totalAdvance - totalExpense;

    return { totalAdvance, totalExpense, totalPending, balance };
  }, [monthExpenses]);

  // ── Handle bill file select ──
  const handleBillSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB.');
      return;
    }

    setBillFile(file);

    // Preview
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setBillPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setBillPreview(null);
    }
  };

  // ── Submit expense ──
  const handleSubmitExpense = async () => {
    const amount = parseFloat(submitAmount);
    if (!submitCategory) {
      toast.error('Please select a category');
      return;
    }
    if (!submitType) {
      toast.error('Please select an expense type');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!submitDate) {
      toast.error('Please select the expense date');
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload bill if selected
      let billUrl = '';
      if (billFile) {
        setIsUploading(true);
        const uploadResult = await uploadFile(billFile, 'expenses');
        if (uploadResult.error || !uploadResult.url) {
          toast.error('Failed to upload bill: ' + uploadResult.error);
          setIsSubmitting(false);
          setIsUploading(false);
          return;
        }
        billUrl = uploadResult.url;
        setIsUploading(false);
      }

      const { error } = await createExpense({
        employee_id: employeeId,
        category: submitCategory,
        type: submitType as 'advance' | 'expense',
        amount,
        expense_date: submitDate,
        description: submitDescription.trim() || undefined,
      });

      if (error) {
        toast.error(error);
      } else {
        toast.success('Expense submitted successfully');
        resetSubmitForm();
        setIsSubmitDialogOpen(false);
        loadMyExpenses();
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  const resetSubmitForm = () => {
    setSubmitCategory(categories[0] || '');
    setSubmitType(expenseTypes[0] || 'expense');
    setSubmitAmount('');
    setSubmitDate(todayISTString());
    setSubmitDescription('');
    setBillFile(null);
    setBillPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Approve expense ──
  const handleApprove = async (expense: Expense) => {
    setApprovingId(expense.id);
    try {
      const { error } = await approveExpense(expense.id, 'approved', employeeId);
      if (error) {
        toast.error('Failed to approve expense');
      } else {
        toast.success('Expense approved');
        loadPendingTeamExpenses();
        loadMyExpenses();
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setApprovingId(null);
    }
  };

  // ── Reject expense ──
  const openRejectDialog = (expenseId: number) => {
    setRejectExpenseId(expenseId);
    setRejectionReason('');
    setIsRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectExpenseId) return;
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setIsRejecting(true);
    try {
      const { error } = await approveExpense(
        rejectExpenseId,
        'rejected',
        employeeId,
        rejectionReason.trim(),
      );
      if (error) {
        toast.error('Failed to reject expense');
      } else {
        toast.success('Expense rejected');
        setIsRejectDialogOpen(false);
        setRejectExpenseId(null);
        setRejectionReason('');
        loadPendingTeamExpenses();
        loadMyExpenses();
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsRejecting(false);
    }
  };

  // ── Render ──
  const isLoading = isLoadingMy || (canApprove && activeTab === 'approve' && isLoadingTeam);

  if (isLoading && activeTab === 'my' && isLoadingMy) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Expenses</h2>
        </div>
        {/* Month navigator */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSelectedMonth((m) => navigateMonth(m, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2 min-w-[140px] text-center">
            {formatMonthYear(selectedMonth)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSelectedMonth((m) => navigateMonth(m, 1))}
            disabled={selectedMonth >= currentMonthString()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Month header banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-primary mb-1">
            Expense / Advance For the month of{' '}
            <span className="text-base">{formatMonthYear(selectedMonth)}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {monthExpenses.length} record{monthExpenses.length !== 1 ? 's' : ''} this month
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="my" className="flex-1 sm:flex-auto">
            <Wallet className="h-4 w-4 mr-1.5" />
            My Expenses
            {monthSummary.totalPending > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs px-1.5">
                {monthExpenses.filter((e) => e.status === 'pending').length}
              </Badge>
            )}
          </TabsTrigger>
          {canApprove && (
            <TabsTrigger value="approve" className="flex-1 sm:flex-auto">
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Approve
              {pendingTeamExpenses.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs px-1.5">
                  {pendingTeamExpenses.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── My Expenses Tab ── */}
        <TabsContent value="my" className="mt-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Card>
              <CardContent className="p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Banknote className="h-3.5 w-3.5 text-emerald-500" />
                  Total Advance
                </div>
                <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(monthSummary.totalAdvance)}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Receipt className="h-3.5 w-3.5 text-blue-500" />
                  Approved Expense
                </div>
                <span className="text-base font-bold text-blue-700 dark:text-blue-400">
                  {formatCurrency(monthSummary.totalExpense)}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Balance card */}
          <Card className={`border-2 ${monthSummary.balance < 0 ? 'border-rose-500/40 bg-rose-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">
                  {monthSummary.balance < 0 ? 'Used Over Advance' : 'Remaining Balance'}
                </div>
                <span className={`text-xl font-bold ${monthSummary.balance < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  {formatCurrency(Math.abs(monthSummary.balance))}
                </span>
              </div>
              {monthSummary.totalPending > 0 && (
                <div className="text-right">
                  <div className="text-xs text-muted-foreground mb-0.5">Pending</div>
                  <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    {formatCurrency(monthSummary.totalPending)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit button */}
          <div className="flex justify-end mt-3 mb-3">
            <Button size="sm" onClick={() => setIsSubmitDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Submit Expense</span>
            </Button>
          </div>

          {/* Expenses list */}
          {isLoadingMy ? (
            <LoadingSkeleton />
          ) : monthExpenses.length === 0 ? (
            <EmptyState
              title="No expenses this month"
              description="Submit your first expense claim for this month."
              onAction={() => setIsSubmitDialogOpen(true)}
              actionLabel="Submit Expense"
            />
          ) : (
            <ScrollArea className="h-[calc(100vh-480px)]">
              <div className="flex flex-col gap-3">
                {monthExpenses.map((expense) => (
                  <ExpenseCard key={expense.id} expense={expense} />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* ── Approve Tab ── */}
        {canApprove && (
          <TabsContent value="approve" className="mt-4">
            {isLoadingTeam ? (
              <LoadingSkeleton />
            ) : pendingTeamExpenses.length === 0 ? (
              <EmptyState
                title="No pending approvals"
                description="All team expenses have been processed."
              />
            ) : (
              <ScrollArea className="h-[calc(100vh-260px)]">
                <div className="flex flex-col gap-3">
                  {pendingTeamExpenses.map((expense) => (
                    <PendingTeamExpenseCard
                      key={expense.id}
                      expense={expense}
                      isApproving={approvingId === expense.id}
                      onApprove={handleApprove}
                      onReject={openRejectDialog}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Submit Expense Dialog */}
      <Dialog
        open={isSubmitDialogOpen}
        onOpenChange={(open) => {
          setIsSubmitDialogOpen(open);
          if (!open) resetSubmitForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Submit Expense
            </DialogTitle>
            <DialogDescription>
              Submit a new expense claim or advance request.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Category <span className="text-destructive">*</span>
              </label>
              <Select value={submitCategory} onValueChange={setSubmitCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Type <span className="text-destructive">*</span>
              </label>
              <Select value={submitType} onValueChange={setSubmitType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {expenseTypes.length > 0
                    ? expenseTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </SelectItem>
                      ))
                    : EXPENSE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Amount <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="number"
                  placeholder="0.00"
                  value={submitAmount}
                  onChange={(e) => setSubmitAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  className="pl-9"
                />
              </div>
            </div>

            {/* Date - defaults to today */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Expense Date <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={submitDate}
                onChange={(e) => setSubmitDate(e.target.value)}
                max={todayISTString()}
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Brief description of the expense..."
                value={submitDescription}
                onChange={(e) => setSubmitDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>

            {/* Bill Upload */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Upload Bill / Receipt</label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*,.pdf"
                onChange={handleBillSelect}
                className="hidden"
                id="bill-upload"
              />
              {!billFile ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-20 border-dashed flex flex-col gap-1 cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Tap to upload bill (Image or PDF, max 5MB)
                  </span>
                </Button>
              ) : (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {billPreview ? (
                    <div className="h-12 w-12 rounded overflow-hidden bg-muted flex-shrink-0">
                      <img src={billPreview} alt="Bill preview" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{billFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(billFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => {
                      setBillFile(null);
                      setBillPreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsSubmitDialogOpen(false);
                resetSubmitForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitExpense}
              disabled={isSubmitting || isUploading || !submitCategory || !submitType || !submitAmount || !submitDate}
            >
              {isSubmitting || isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isUploading ? 'Uploading...' : 'Submitting...'}
                </>
              ) : (
                'Submit'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Expense Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Reject Expense
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this expense claim.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              maxLength={300}
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsRejectDialogOpen(false);
                setRejectExpenseId(null);
                setRejectionReason('');
              }}
              disabled={isRejecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isRejecting || !rejectionReason.trim()}
            >
              {isRejecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-1" />
                  Reject
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================================================================
   Sub-components
   ================================================================ */

function ExpenseCard({ expense }: { expense: Expense }) {
  return (
    <Card className="border">
      <CardContent className="p-4">
        {/* Top row: badges */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="outline" className={TYPE_BADGE[expense.type] || ''}>
            {TYPE_LABEL[expense.type] || expense.type}
          </Badge>
          <Badge variant="outline" className={STATUS_BADGE[expense.status] || ''}>
            {STATUS_LABEL[expense.status] || expense.status}
          </Badge>
        </div>

        {/* Amount - safe parsing */}
        <div className="text-xl font-bold mb-1">
          {formatCurrency(expense.amount)}
        </div>

        {/* Description */}
        {expense.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
            {expense.description}
          </p>
        )}

        {/* Date */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          {formatDate(expense.expense_date)}
        </div>

        {/* Rejection reason */}
        {expense.status === 'rejected' && expense.rejection_reason && (
          <div className="mt-3 p-2.5 rounded-md bg-rose-500/10 border border-rose-500/20">
            <p className="text-xs font-medium text-rose-700 dark:text-rose-400 mb-0.5">
              Rejection Reason:
            </p>
            <p className="text-sm text-rose-600 dark:text-rose-300">
              {expense.rejection_reason}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PendingTeamExpenseCard({
  expense,
  isApproving,
  onApprove,
  onReject,
}: {
  expense: Expense;
  isApproving: boolean;
  onApprove: (expense: Expense) => void;
  onReject: (expenseId: number) => void;
}) {
  return (
    <Card className="border">
      <CardContent className="p-4">
        {/* Employee name */}
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-sm">
            {expense.employee_name || 'Unknown'}
          </span>
          <Badge variant="outline" className={TYPE_BADGE[expense.type] || ''}>
            {TYPE_LABEL[expense.type] || expense.type}
          </Badge>
        </div>

        {/* Amount + Date */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-lg font-bold">
            {formatCurrency(expense.amount)}
          </span>
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {formatDate(expense.expense_date)}
          </span>
        </div>

        {/* Description */}
        {expense.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {expense.description}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            className="text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
            disabled={isApproving}
            onClick={() => onApprove(expense)}
          >
            {isApproving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-rose-700 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
            disabled={isApproving}
            onClick={() => onReject(expense.id)}
          >
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  description,
  onAction,
  actionLabel,
}: {
  title: string;
  description: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Receipt className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-xs">
          {description}
        </p>
        {onAction && actionLabel && (
          <Button size="sm" onClick={onAction}>
            <Plus className="h-4 w-4 mr-1" />
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Balance card skeleton */}
      <Card>
        <CardContent className="p-3">
          <Skeleton className="h-3 w-32 mb-2" />
          <Skeleton className="h-6 w-28" />
        </CardContent>
      </Card>

      {/* Card skeletons */}
      <div className="flex flex-col gap-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex gap-2 mb-3">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-6 w-28 mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
