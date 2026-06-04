import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Loader2,
  Receipt,
  Wallet,
  Banknote,
  IndianRupee,
  CalendarDays,
  X,
  Upload,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Landmark,
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
  fetchExpenseTypes,
  fetchAdvanceAllocations,
} from '@/lib/ess-api';
import { uploadFile, getFileUrl } from '@/lib/api/config';
import type { Expense, AdvanceAllocation } from '@/lib/ess-types';
import { EXPENSE_TYPES } from '@/lib/ess-types';

interface ExpensesPageProps {
  employeeId: number;
  employeeName: string;
  role: string;
  canApprove: boolean;
}

// ── Badge style maps ──
const CATEGORY_BADGE: Record<string, string> = {
  advance:
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  expense:
    'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  employee_advance:
    'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
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

const CATEGORY_LABEL: Record<string, string> = {
  advance: 'Advance',
  expense: 'Expense',
  employee_advance: 'Advance to Employee',
};

const TYPE_LABEL: Record<string, string> = {
  travel: 'Travel',
  food: 'Food',
  other: 'Other',
  cab: 'Cab',
  supplies: 'Supplies',
  medical: 'Medical',
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

// Categories to exclude from DB type enum
const EXCLUDED_CATEGORIES = ['cab', 'supplies', 'medical'];

export function ExpensesPage({
  employeeId,
  employeeName,
  role,
  canApprove,
}: ExpensesPageProps) {
  const [activeTab, setActiveTab] = useState('advance');

  // ── Advance tab state ──
  const [advanceAllocations, setAdvanceAllocations] = useState<AdvanceAllocation[]>([]);
  const [isLoadingAdvance, setIsLoadingAdvance] = useState(true);

  // My expenses
  const [myExpenses, setMyExpenses] = useState<Expense[]>([]);
  const [isLoadingMy, setIsLoadingMy] = useState(false);
  const [serverMonthSummary, setServerMonthSummary] = useState<{
    advance_received: number;
    this_month_advance: number;
    opening_balance: number;
    approved_expenses: number;
    closing_balance: number;
  } | null>(null);

  // Month filter
  const [selectedMonth, setSelectedMonth] = useState(currentMonthString());

  // Expense types (dynamic from DB)
  const [expenseTypes, setExpenseTypes] = useState<string[]>([]);

  // Hardcoded type options: Expense and Advance to Employee
  const typeOptions = [
    { value: 'expense', label: 'Expense' },
    { value: 'employee_advance', label: 'Advance to Employee' },
  ];

  // Filtered expense types (DB 'type' enum minus excluded)
  const filteredExpenseTypes = useMemo(() => {
    return expenseTypes.filter((t) => !EXCLUDED_CATEGORIES.includes(t.toLowerCase()));
  }, [expenseTypes]);

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

  // ── Load advance allocations ──
  const loadAdvanceAllocations = useCallback(async () => {
    setIsLoadingAdvance(true);
    try {
      const { data, error } = await fetchAdvanceAllocations(employeeId);
      if (error) {
        toast.error('Failed to load advances');
      } else if (data) {
        setAdvanceAllocations(data.items ?? []);
      }
    } catch {
      toast.error('Failed to load advances');
    } finally {
      setIsLoadingAdvance(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadAdvanceAllocations();
  }, [loadAdvanceAllocations]);

  // ── Load month data (expenses + month summary) ──
  const loadMyExpenses = useCallback(async (month?: string) => {
    setIsLoadingMy(true);
    try {
      const { data, error } = await fetchExpenses(employeeId, { month });
      if (error) {
        toast.error('Failed to load expenses');
      } else {
        setMyExpenses(data?.items ?? []);
        if (data && 'month_summary' in data && (data as Record<string, unknown>).month_summary) {
          setServerMonthSummary((data as Record<string, unknown>).month_summary as typeof serverMonthSummary);
        } else {
          setServerMonthSummary(null);
        }
      }
    } catch {
      toast.error('Something went wrong while loading expenses');
    } finally {
      setIsLoadingMy(false);
    }
  }, [employeeId]);

  // Load month data whenever month changes (needed for both tabs)
  useEffect(() => {
    loadMyExpenses(selectedMonth);
  }, [selectedMonth, loadMyExpenses]);

  // ── Load expense types & categories from DB ──
  useEffect(() => {
    fetchExpenseTypes().then(({ data }) => {
      if (data) {
        setExpenseTypes(data.types || []);
      }
    });
  }, []);

  // ── Month-filtered expenses ──
  const monthExpenses = useMemo(() => {
    return myExpenses.filter((e) => {
      if (!e.expense_date) return false;
      return e.expense_date.startsWith(selectedMonth);
    });
  }, [myExpenses, selectedMonth]);

  // ── Month-filtered advance allocations ──
  const [selYear, selMonth] = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return [y, m];
  }, [selectedMonth]);

  const monthAdvanceAllocations = useMemo(() => {
    return advanceAllocations.filter((a) => a.year === selYear && a.month === selMonth);
  }, [advanceAllocations, selYear, selMonth]);

  const thisMonthAdvanceTotal = useMemo(() => {
    return monthAdvanceAllocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  }, [monthAdvanceAllocations]);

  // ── Summary for selected month (running balance) ──
  const monthSummary = useMemo(() => {
    const thisMonthAdvance = serverMonthSummary?.this_month_advance ?? 0;
    const openingBalance = serverMonthSummary?.opening_balance ?? 0;
    const totalAdvance = serverMonthSummary?.advance_received ?? (thisMonthAdvance + openingBalance);
    const totalExpense = serverMonthSummary?.approved_expenses ??
      monthExpenses
        .filter((e) => (e.status === 'approved' || e.status === 'reimbursed'))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const totalPending = monthExpenses
      .filter((e) => e.status === 'pending')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const closingBalance = serverMonthSummary?.closing_balance ?? (totalAdvance - totalExpense);

    return { totalAdvance, totalExpense, totalPending, closingBalance, thisMonthAdvance, openingBalance };
  }, [monthExpenses, serverMonthSummary]);

  // ── Handle bill file select ──
  const handleBillSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB.');
      return;
    }

    setBillFile(file);

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
      toast.error('Please select a type');
      return;
    }
    if (submitCategory === 'expense' && !submitType) {
      toast.error('Please select a category');
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
        type: submitType || 'other',
        amount,
        expense_date: submitDate,
        description: submitDescription.trim() || undefined,
        bill_url: billUrl || undefined,
        bill_type: billFile?.type?.startsWith('image/') ? 'image' : billFile?.type === 'application/pdf' ? 'pdf' : undefined,
      });

      if (error) {
        toast.error(error);
      } else {
        toast.success('Expense submitted successfully');
        resetSubmitForm();
        setIsSubmitDialogOpen(false);
        loadMyExpenses(selectedMonth);
        loadAdvanceAllocations();
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  const resetSubmitForm = () => {
    setSubmitCategory('expense');
    setSubmitType(filteredExpenseTypes[0] || 'travel');
    setSubmitAmount('');
    setSubmitDate(todayISTString());
    setSubmitDescription('');
    setBillFile(null);
    setBillPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ──
  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Expenses</h2>
      </div>

      {/* Month Picker — above tabs, shared by both tabs */}
      <div className="flex items-center justify-between gap-2">
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="advance" className="flex-1 sm:flex-auto">
            <Landmark className="h-4 w-4 mr-1.5" />
            My Advance
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex-1 sm:flex-auto">
            <Wallet className="h-4 w-4 mr-1.5" />
            My Expenses
            {monthSummary.totalPending > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs px-1.5">
                {monthSummary.totalPending > 0 ? monthExpenses.filter((e) => e.status === 'pending').length : 0}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════
           TAB 1: My Advance — Shows advance for the selected month
           ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="advance" className="mt-4">
          {isLoadingAdvance || isLoadingMy ? (
            <LoadingSkeleton />
          ) : (
            <>
              {/* Summary: Opening Balance + This Month Advance */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Card>
                  <CardContent className="p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Banknote className="h-3.5 w-3.5 text-emerald-500" />
                      Total Available
                    </div>
                    <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(monthSummary.totalAdvance)}
                    </span>
                    <div className="text-[10px] text-muted-foreground leading-tight">
                      <div>Opening Balance (B/F): {formatCurrency(monthSummary.openingBalance)}</div>
                      <div>This Month: +{formatCurrency(thisMonthAdvanceTotal)}</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Receipt className="h-3.5 w-3.5 text-blue-500" />
                      Expenses Used
                    </div>
                    <span className="text-base font-bold text-blue-700 dark:text-blue-400">
                      {formatCurrency(monthSummary.totalExpense)}
                    </span>
                  </CardContent>
                </Card>
              </div>

              {/* Closing Balance card */}
              <Card className={`border-2 mb-3 ${monthSummary.closingBalance < 0 ? 'border-rose-500/40 bg-rose-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">
                      {monthSummary.closingBalance < 0 ? 'Used Over Advance' : 'Closing Balance'}
                    </div>
                    <span className={`text-xl font-bold ${monthSummary.closingBalance < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      {formatCurrency(Math.abs(monthSummary.closingBalance))}
                    </span>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                    <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </CardContent>
              </Card>

              {/* Advance Records for this month */}
              {monthAdvanceAllocations.length === 0 ? (
                <EmptyState
                  title="No advance this month"
                  description={`No advance allocation received for ${formatMonthYear(selectedMonth)}.`}
                  icon="advance"
                />
              ) : (
                <>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Advance Received — {formatMonthYear(selectedMonth)}
                  </div>
                  <ScrollArea className="h-[calc(100vh-460px)]">
                    <div className="flex flex-col gap-2">
                      {monthAdvanceAllocations.map((alloc) => (
                        <Card key={alloc.id} className="border">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 mt-0.5">
                                  <Landmark className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                  <div className="text-sm font-semibold">
                                    Office Advance
                                  </div>
                                  {alloc.remarks && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {alloc.remarks}
                                    </p>
                                  )}
                                  {alloc.created_at && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                      <CalendarDays className="h-3 w-3" />
                                      {formatDate(alloc.created_at)}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                                  {formatCurrency(alloc.amount)}
                                </div>
                                <div className="text-[9px] text-muted-foreground">Allocated</div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
           TAB 2: My Expenses — Shows expenses with month navigation
           ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="expenses" className="mt-4">
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
                <div className="text-[10px] text-muted-foreground leading-tight">
                  <div>Opening Balance (B/F): {formatCurrency(monthSummary.openingBalance)}</div>
                  <div>This Month: +{formatCurrency(monthSummary.thisMonthAdvance)}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Receipt className="h-3.5 w-3.5 text-blue-500" />
                  Total Used
                </div>
                <span className="text-base font-bold text-blue-700 dark:text-blue-400">
                  {formatCurrency(monthSummary.totalExpense)}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Balance card */}
          <Card className={`border-2 ${monthSummary.closingBalance < 0 ? 'border-rose-500/40 bg-rose-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">
                  {monthSummary.closingBalance < 0 ? 'Used Over Advance' : 'Closing Balance'}
                </div>
                <span className={`text-xl font-bold ${monthSummary.closingBalance < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  {formatCurrency(Math.abs(monthSummary.closingBalance))}
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
            {/* Type (Expense or Advance to Employee) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Type <span className="text-destructive">*</span>
              </label>
              <Select value={submitCategory} onValueChange={setSubmitCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category (travel/food/other - excludes cab, supplies, medical) */}
            {submitCategory === 'expense' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  Category <span className="text-destructive">*</span>
                </label>
                <Select value={submitType} onValueChange={setSubmitType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredExpenseTypes.length > 0
                      ? filteredExpenseTypes.map((t) => (
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
            )}

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

            {/* Date - conditional label based on type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                {submitCategory === 'expense' ? (
                  <>
                    Expense Date <span className="text-destructive">*</span>
                  </>
                ) : (
                  <>
                    Advance Given Date <span className="text-destructive">*</span>
                  </>
                )}
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
              disabled={isSubmitting || isUploading || !submitCategory || (submitCategory === 'expense' && !submitType) || !submitAmount || !submitDate}
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
          <Badge variant="outline" className={CATEGORY_BADGE[expense.category || ''] || ''}>
            {CATEGORY_LABEL[expense.category || ''] || expense.category || expense.type}
          </Badge>
          {expense.type && expense.type !== 'other' && expense.category !== 'employee_advance' && (
            <Badge variant="outline" className="bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20">
              {TYPE_LABEL[expense.type] || expense.type}
            </Badge>
          )}
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

function EmptyState({
  title,
  description,
  onAction,
  actionLabel,
  icon = 'expense',
}: {
  title: string;
  description: string;
  onAction?: () => void;
  actionLabel?: string;
  icon?: 'expense' | 'advance';
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          {icon === 'advance' ? (
            <Landmark className="h-8 w-8 text-muted-foreground" />
          ) : (
            <Receipt className="h-8 w-8 text-muted-foreground" />
          )}
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
