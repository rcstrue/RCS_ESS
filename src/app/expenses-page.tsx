"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";

// shadcn/ui components
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

// Lucide icons
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Edit3,
  CheckCircle2,
  XCircle,
  Plane,
  UtensilsCrossed,
  Car,
  Package,
  Heart,
  HelpCircle,
  IndianRupee,
  CalendarDays,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  Upload,
  X,
  FileText,
  Receipt,
  Wallet,
  ClipboardCheck,
  Users,
  Building2,
  ArrowUpDown,
  Download,
  Image as ImageIcon,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExpensesPageProps {
  userRole: "employee" | "manager" | "admin";
  userId: number;
  userName: string;
  userUnitId: number;
  userEmpCode: string;
  managerId: number;
}

interface Expense {
  id: number;
  employee_id: number;
  manager_id: number;
  emp_name: string;
  emp_code: string;
  unit_id: number;
  month: number;
  year: number;
  category: string;
  type: "expense" | "employee_advance";
  amount: number;
  description: string;
  bill_url: string;
  bill_type: string;
  expense_date: string;
  status: "pending" | "approved" | "rejected" | "reimbursed";
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string;
  rejected_by: number | null;
  edited_by: number | null;
  edited_at: string | null;
  settlement_id: number | null;
  created_at: string;
  updated_at: string;
}

interface DashboardData {
  pending_count: number;
  pending_amount: number;
  approved_count: number;
  approved_amount: number;
  rejected_count: number;
  current_month_total: number;
  current_month_count: number;
  total_expenses: number;
}

interface FilterState {
  status: string;
  type: string;
  month: string;
  year: string;
  search: string;
}

interface FormData {
  category: string;
  type: string;
  amount: string;
  description: string;
  expense_date: string;
  month: string;
  year: string;
  emp_name: string;
  emp_code: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API_BASE = "https://join.rcsfacility.com/api/ess/expenses.php";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const YEARS = Array.from({ length: 5 }, (_, i) => String(CURRENT_YEAR - 2 + i));

const CATEGORIES = [
  { value: "travel", label: "Travel", icon: Plane, color: "text-sky-600 bg-sky-50" },
  { value: "food", label: "Food", icon: UtensilsCrossed, color: "text-orange-600 bg-orange-50" },
  { value: "cab", label: "Cab / Transport", icon: Car, color: "text-violet-600 bg-violet-50" },
  { value: "supplies", label: "Supplies", icon: Package, color: "text-emerald-600 bg-emerald-50" },
  { value: "medical", label: "Medical", icon: Heart, color: "text-rose-600 bg-rose-50" },
  { value: "other", label: "Other", icon: HelpCircle, color: "text-slate-600 bg-slate-50" },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

const EMPTY_FILTERS: FilterState = {
  status: "all",
  type: "all",
  month: String(CURRENT_MONTH),
  year: String(CURRENT_YEAR),
  search: "",
};

const EMPTY_FORM: FormData = {
  category: "",
  type: "expense",
  amount: "",
  description: "",
  expense_date: new Date().toISOString().split("T")[0],
  month: String(CURRENT_MONTH),
  year: String(CURRENT_YEAR),
  emp_name: "",
  emp_code: "",
};

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function apiRequest<T>(
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const url = new URL(API_BASE);
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== "") {
      url.searchParams.set(key, String(val));
    }
  });

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

async function apiPost<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

async function fetchExpenses(params: {
  action: "list";
  employee_id?: number;
  manager_id?: number;
  unit_id?: number;
  status?: string;
  type?: string;
  month?: number;
  year?: number;
  search?: string;
}): Promise<Expense[]> {
  const data = await apiRequest<{ data: Expense[] }>(params);
  return data.data ?? [];
}

async function createExpense(data: {
  action: "create";
  employee_id: number;
  manager_id: number;
  emp_name: string;
  emp_code: string;
  unit_id: number;
  month: number;
  year: number;
  category: string;
  type: string;
  amount: number;
  description: string;
  expense_date: string;
  bill_url?: string;
  bill_type?: string;
}): Promise<{ success: boolean; id?: number }> {
  return apiPost(data);
}

async function approveExpense(
  id: number,
  approved_by: number
): Promise<{ success: boolean }> {
  return apiPost({ action: "approve", id, approved_by });
}

async function rejectExpense(
  id: number,
  rejected_by: number,
  rejection_reason: string
): Promise<{ success: boolean }> {
  return apiPost({ action: "reject", id, rejected_by, rejection_reason });
}

async function updateExpense(
  id: number,
  fields: Record<string, unknown>
): Promise<{ success: boolean }> {
  return apiPost({ action: "update", id, ...fields });
}

async function fetchDashboard(params: {
  action: "dashboard";
  employee_id?: number;
  manager_id?: number;
  unit_id?: number;
}): Promise<DashboardData> {
  const data = await apiRequest<{ data: DashboardData }>(params);
  return data.data ?? ({} as DashboardData);
}

// ─── Utility Functions ───────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCategoryIcon(category: string) {
  return CATEGORY_MAP[category] ?? CATEGORY_MAP.other;
}

function getStatusConfig(status: Expense["status"]) {
  switch (status) {
    case "pending":
      return {
        label: "Pending",
        className: "bg-amber-50 text-amber-700 border-amber-200",
        dotClass: "bg-amber-500",
      };
    case "approved":
      return {
        label: "Approved",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dotClass: "bg-emerald-500",
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "bg-red-50 text-red-700 border-red-200",
        dotClass: "bg-red-500",
      };
    case "reimbursed":
      return {
        label: "Reimbursed",
        className: "bg-purple-50 text-purple-700 border-purple-200",
        dotClass: "bg-purple-500",
      };
    default:
      return {
        label: status,
        className: "bg-slate-50 text-slate-700 border-slate-200",
        dotClass: "bg-slate-500",
      };
  }
}

function getTypeConfig(type: Expense["type"]) {
  switch (type) {
    case "expense":
      return {
        label: "Expense",
        className: "bg-slate-100 text-slate-700 border-slate-200",
      };
    case "employee_advance":
      return {
        label: "Advance",
        className: "bg-emerald-100 text-emerald-700 border-emerald-200",
      };
    default:
      return {
        label: type,
        className: "bg-slate-100 text-slate-700 border-slate-200",
      };
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Expense["status"] }) {
  const config = getStatusConfig(status);
  return (
    <Badge variant="outline" className={`${config.className} gap-1.5 font-medium`}>
      <span className={`inline-block size-1.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: Expense["type"] }) {
  const config = getTypeConfig(type);
  return (
    <Badge variant="outline" className={`${config.className} font-medium`}>
      {config.label}
    </Badge>
  );
}

function CategoryCell({ category }: { category: string }) {
  const cat = getCategoryIcon(category);
  const Icon = cat.icon;
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex size-8 items-center justify-center rounded-lg ${cat.color}`}>
        <Icon className="size-4" />
      </div>
      <span className="font-medium capitalize">{cat.label}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted">
        <Receipt className="size-8 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-foreground">No expenses found</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function DashboardSummaryCards({ data, isLoading }: { data: DashboardData | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-5">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="mb-1 h-7 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    {
      title: "Pending",
      count: data.pending_count,
      amount: data.pending_amount,
      icon: Clock,
      iconColor: "text-amber-600",
      iconBg: "bg-amber-50",
      accentBorder: "border-l-amber-500",
    },
    {
      title: "Approved",
      count: data.approved_count,
      amount: data.approved_amount,
      icon: CheckCircle2,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
      accentBorder: "border-l-emerald-500",
    },
    {
      title: "Rejected",
      count: data.rejected_count,
      amount: 0,
      icon: XCircle,
      iconColor: "text-red-600",
      iconBg: "bg-red-50",
      accentBorder: "border-l-red-500",
    },
    {
      title: "This Month",
      count: data.current_month_count,
      amount: data.current_month_total,
      icon: CalendarDays,
      iconColor: "text-slate-600",
      iconBg: "bg-slate-100",
      accentBorder: "border-l-slate-500",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.title}
            className={`overflow-hidden border-l-4 ${card.accentBorder}`}
          >
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </span>
                <div
                  className={`flex size-9 items-center justify-center rounded-lg ${card.iconBg}`}
                >
                  <Icon className={`size-4.5 ${card.iconColor}`} />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {formatCurrency(card.amount)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {card.count} {card.count === 1 ? "entry" : "entries"}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function FilterBar({
  filters,
  onFilterChange,
  onApply,
  onReset,
  showTypeFilter = true,
}: {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: string) => void;
  onApply: () => void;
  onReset: () => void;
  showTypeFilter?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Search */}
          <div className="min-w-[180px] flex-1">
            <Label className="mb-1.5 text-xs font-medium text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search description, name..."
                value={filters.search}
                onChange={(e) => onFilterChange("search", e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Status */}
          <div className="min-w-[140px]">
            <Label className="mb-1.5 text-xs font-medium text-muted-foreground">
              Status
            </Label>
            <Select
              value={filters.status}
              onValueChange={(v) => onFilterChange("status", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="reimbursed">Reimbursed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type */}
          {showTypeFilter && (
            <div className="min-w-[140px]">
              <Label className="mb-1.5 text-xs font-medium text-muted-foreground">
                Type
              </Label>
              <Select
                value={filters.type}
                onValueChange={(v) => onFilterChange("type", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="employee_advance">Advance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Month */}
          <div className="min-w-[130px]">
            <Label className="mb-1.5 text-xs font-medium text-muted-foreground">
              Month
            </Label>
            <Select
              value={filters.month}
              onValueChange={(v) => onFilterChange("month", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Year */}
          <div className="min-w-[110px]">
            <Label className="mb-1.5 text-xs font-medium text-muted-foreground">
              Year
            </Label>
            <Select
              value={filters.year}
              onValueChange={(v) => onFilterChange("year", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <Button onClick={onApply} size="sm" className="gap-1.5">
              <Filter className="size-3.5" />
              Apply
            </Button>
            <Button onClick={onReset} variant="outline" size="sm" className="gap-1.5">
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpenseTable({
  expenses,
  userRole,
  onView,
  onEdit,
  onApprove,
  onReject,
  isLoading,
}: {
  expenses: Expense[];
  userRole: ExpensesPageProps["userRole"];
  onView: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
  onApprove: (expense: Expense) => void;
  onReject: (expense: Expense) => void;
  isLoading: boolean;
}) {
  const [isMobile] = useState(false);
  // Simple responsive detection via CSS; we render both and hide via classes

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-6 w-9" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (expenses.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState message="No expenses match your current filters. Try adjusting the filters or submit a new expense." />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Desktop Table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[200px]">Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="max-w-[200px]">Description</TableHead>
                {(userRole === "manager" || userRole === "admin") && (
                  <TableHead>Employee</TableHead>
                )}
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense, index) => (
                <TableRow key={expense.id} className={index % 2 === 1 ? "bg-muted/10" : ""}>
                  <TableCell>
                    <CategoryCell category={expense.category} />
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={expense.type} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold text-foreground">
                      {formatCurrency(expense.amount)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(expense.expense_date)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={expense.status} />
                  </TableCell>
                  <TableCell>
                    <p className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {expense.description || "—"}
                    </p>
                  </TableCell>
                  {(userRole === "manager" || userRole === "admin") && (
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{expense.emp_name}</span>
                        <span className="text-xs text-muted-foreground">{expense.emp_code}</span>
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onView(expense)} className="gap-2">
                          <Eye className="size-3.5" />
                          View Details
                        </DropdownMenuItem>

                        {userRole === "employee" && expense.status === "pending" && (
                          <DropdownMenuItem onClick={() => onEdit(expense)} className="gap-2">
                            <Edit3 className="size-3.5" />
                            Edit
                          </DropdownMenuItem>
                        )}

                        {userRole === "admin" && (
                          <DropdownMenuItem onClick={() => onEdit(expense)} className="gap-2">
                            <Edit3 className="size-3.5" />
                            Edit
                          </DropdownMenuItem>
                        )}

                        {(userRole === "manager" || userRole === "admin") &&
                          expense.status === "pending" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => onApprove(expense)}
                                className="gap-2 text-emerald-700 focus:text-emerald-700"
                              >
                                <CheckCircle2 className="size-3.5" />
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onReject(expense)}
                                className="gap-2 text-red-700 focus:text-red-700"
                              >
                                <XCircle className="size-3.5" />
                                Reject
                              </DropdownMenuItem>
                            </>
                          )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile Cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {expenses.map((expense) => {
          const cat = getCategoryIcon(expense.category);
          const CatIcon = cat.icon;
          const statusConfig = getStatusConfig(expense.status);
          const typeConfig = getTypeConfig(expense.type);

          return (
            <Card key={expense.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex size-10 items-center justify-center rounded-lg ${cat.color}`}>
                      <CatIcon className="size-5" />
                    </div>
                    <div>
                      <p className="font-semibold capitalize text-foreground">{cat.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(expense.expense_date)}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => onView(expense)} className="gap-2">
                        <Eye className="size-3.5" />
                        View Details
                      </DropdownMenuItem>
                      {userRole === "employee" && expense.status === "pending" && (
                        <DropdownMenuItem onClick={() => onEdit(expense)} className="gap-2">
                          <Edit3 className="size-3.5" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {userRole === "admin" && (
                        <DropdownMenuItem onClick={() => onEdit(expense)} className="gap-2">
                          <Edit3 className="size-3.5" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {(userRole === "manager" || userRole === "admin") &&
                        expense.status === "pending" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onApprove(expense)}
                              className="gap-2 text-emerald-700 focus:text-emerald-700"
                            >
                              <CheckCircle2 className="size-3.5" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onReject(expense)}
                              className="gap-2 text-red-700 focus:text-red-700"
                            >
                              <XCircle className="size-3.5" />
                              Reject
                            </DropdownMenuItem>
                          </>
                        )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={typeConfig.className}>
                    {typeConfig.label}
                  </Badge>
                  <Badge variant="outline" className={statusConfig.className}>
                    {statusConfig.label}
                  </Badge>
                </div>

                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-xl font-bold text-foreground">
                    {formatCurrency(expense.amount)}
                  </span>
                </div>

                {expense.description && (
                  <p className="mb-2 text-sm text-muted-foreground line-clamp-2">
                    {expense.description}
                  </p>
                )}

                {(userRole === "manager" || userRole === "admin") && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    <span>{expense.emp_name}</span>
                    <span className="text-muted-foreground/60">({expense.emp_code})</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Results count */}
      <div className="mt-3 text-center text-sm text-muted-foreground">
        Showing {expenses.length} {expenses.length === 1 ? "entry" : "entries"}
      </div>
    </>
  );
}

function SubmitExpenseDialog({
  open,
  onOpenChange,
  formData,
  onFormChange,
  onSubmit,
  isSubmitting,
  userRole,
  userName,
  userEmpCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: FormData;
  onFormChange: (key: keyof FormData, value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  userRole: ExpensesPageProps["userRole"];
  userName: string;
  userEmpCode: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [billPreview, setBillPreview] = useState<string | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);

  const handleBillChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBillFile(file);
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => setBillPreview(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setBillPreview(file.name);
      }
    }
  };

  const removeBill = () => {
    setBillFile(null);
    setBillPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isAdvance = formData.type === "employee_advance";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-5 text-emerald-600" />
            Submit Expense
          </DialogTitle>
          <DialogDescription>
            Fill in the details below to submit a new expense or advance request.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {/* Type Selection */}
          <div className="grid gap-2">
            <Label className="text-sm font-medium">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(v) => onFormChange("type", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">
                  <div className="flex items-center gap-2">
                    <Receipt className="size-3.5 text-slate-500" />
                    Expense
                  </div>
                </SelectItem>
                <SelectItem value="employee_advance">
                  <div className="flex items-center gap-2">
                    <Wallet className="size-3.5 text-emerald-500" />
                    Employee Advance
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Employee fields for advance */}
          {isAdvance && (userRole === "manager" || userRole === "admin") && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Employee Name</Label>
                <Input
                  placeholder="Enter employee name"
                  value={formData.emp_name}
                  onChange={(e) => onFormChange("emp_name", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Employee Code</Label>
                <Input
                  placeholder="Enter employee code"
                  value={formData.emp_code}
                  onChange={(e) => onFormChange("emp_code", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Category */}
          <div className="grid gap-2">
            <Label className="text-sm font-medium">Category</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = formData.category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => onFormChange("category", cat.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-xs font-medium transition-all hover:shadow-sm ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-transparent bg-muted/50 hover:border-muted-foreground/20"
                    }`}
                  >
                    <div className={`flex size-8 items-center justify-center rounded-lg ${cat.color}`}>
                      <Icon className="size-4" />
                    </div>
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount */}
          <div className="grid gap-2">
            <Label className="text-sm font-medium">Amount (INR)</Label>
            <div className="relative">
              <IndianRupee className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => onFormChange("amount", e.target.value)}
                className="pl-9"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              placeholder="Brief description of the expense..."
              value={formData.description}
              onChange={(e) => onFormChange("description", e.target.value)}
              rows={3}
            />
          </div>

          {/* Date & Month/Year Row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Expense Date</Label>
              <Input
                type="date"
                value={formData.expense_date}
                onChange={(e) => onFormChange("expense_date", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Month</Label>
              <Select
                value={formData.month}
                onValueChange={(v) => onFormChange("month", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Year</Label>
              <Select
                value={formData.year}
                onValueChange={(v) => onFormChange("year", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bill Upload */}
          <div className="grid gap-2">
            <Label className="text-sm font-medium">Upload Bill (Optional)</Label>
            <div className="flex items-center gap-3">
              <label
                htmlFor="bill-upload"
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <Upload className="size-4" />
                Choose File
              </label>
              <input
                id="bill-upload"
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleBillChange}
                className="hidden"
              />
              {billPreview && (
                <div className="flex items-center gap-2">
                  {billPreview.startsWith("data:") ? (
                    <div className="relative">
                      <img
                        src={billPreview}
                        alt="Bill preview"
                        className="size-12 rounded-lg border object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs">
                      <FileText className="size-3.5" />
                      {billPreview}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={removeBill}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              isSubmitting ||
              !formData.category ||
              !formData.amount ||
              !formData.expense_date
            }
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {isSubmitting ? (
              <>
                <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Submit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewExpenseDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!expense) return null;

  const cat = getCategoryIcon(expense.category);
  const CatIcon = cat.icon;
  const statusConfig = getStatusConfig(expense.status);
  const typeConfig = getTypeConfig(expense.type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-slate-600" />
            Expense Details
          </DialogTitle>
          <DialogDescription>
            Detailed view of expense #{expense.id}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Header */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
            <div className="flex items-center gap-3">
              <div className={`flex size-12 items-center justify-center rounded-xl ${cat.color}`}>
                <CatIcon className="size-6" />
              </div>
              <div>
                <p className="text-lg font-semibold capitalize text-foreground">
                  {cat.label}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(expense.expense_date)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(expense.amount)}
              </p>
            </div>
          </div>

          {/* Status & Type */}
          <div className="flex gap-2">
            <StatusBadge status={expense.status} />
            <TypeBadge type={expense.type} />
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
            <DetailItem label="Month/Year" value={`${MONTHS[expense.month - 1]?.label ?? ""} ${expense.year}`} />
            <DetailItem label="Employee" value={`${expense.emp_name} (${expense.emp_code})`} />
            <DetailItem label="Created" value={formatDateTime(expense.created_at)} />
            <DetailItem label="Last Updated" value={formatDateTime(expense.updated_at)} />
          </div>

          {/* Description */}
          {expense.description && (
            <div className="rounded-lg border p-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Description</p>
              <p className="text-sm text-foreground">{expense.description}</p>
            </div>
          )}

          {/* Approval/Rejection info */}
          {expense.status === "approved" && expense.approved_at && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="size-3.5" />
                Approved
              </p>
              <p className="text-sm text-emerald-800">
                Approved by ID: {expense.approved_by} on {formatDateTime(expense.approved_at)}
              </p>
            </div>
          )}

          {expense.status === "rejected" && expense.rejection_reason && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-red-700">
                <XCircle className="size-3.5" />
                Rejected
              </p>
              <p className="mb-1 text-sm font-medium text-red-800">
                Rejection Reason:
              </p>
              <p className="text-sm text-red-700">{expense.rejection_reason}</p>
              {expense.rejected_by && (
                <p className="mt-2 text-xs text-red-600">
                  Rejected by ID: {expense.rejected_by}
                </p>
              )}
            </div>
          )}

          {/* Edit info */}
          {expense.edited_by && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Edit3 className="size-3.5" />
                Edited
              </p>
              <p className="text-sm text-slate-700">
                Edited by ID: {expense.edited_by}
                {expense.edited_at && ` on ${formatDateTime(expense.edited_at)}`}
              </p>
            </div>
          )}

          {/* Bill */}
          {expense.bill_url && (
            <div className="rounded-lg border p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Uploaded Bill
              </p>
              {expense.bill_type?.startsWith("image/") ? (
                <img
                  src={expense.bill_url}
                  alt="Bill"
                  className="max-h-48 rounded-lg border object-contain"
                />
              ) : (
                <a
                  href={expense.bill_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:underline"
                >
                  <Download className="size-4" />
                  View Bill Document
                </a>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ExpensesPage({
  userRole,
  userId,
  userName,
  userEmpCode,
  userUnitId,
  managerId,
}: ExpensesPageProps) {
  // ── State ───────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<string>(() => {
    switch (userRole) {
      case "employee":
        return "my-expenses";
      case "manager":
        return "pending-approvals";
      case "admin":
        return "all-expenses";
      default:
        return "my-expenses";
    }
  });

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);

  // Dialog states
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);

  // Form & selection states
  const [formData, setFormData] = useState<FormData>({ ...EMPTY_FORM });
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // ── Data Fetching ──────────────────────────────────────────────────────

  const loadExpenses = useCallback(async () => {
    setIsLoading(true);
    try {
      let params: Record<string, string | number | undefined> = {
        action: "list",
      };

      switch (activeTab) {
        case "my-expenses":
          params.employee_id = userId;
          params.type = "expense";
          break;
        case "my-advances":
          params.employee_id = userId;
          params.type = "employee_advance";
          break;
        case "pending-approvals":
          if (userRole === "manager") {
            params.manager_id = userId;
          } else {
            params.unit_id = userUnitId;
          }
          params.status = "pending";
          break;
        case "team-expenses":
          if (userRole === "manager") {
            params.manager_id = userId;
          } else {
            params.unit_id = userUnitId;
          }
          break;
        case "all-expenses":
          params.unit_id = userUnitId;
          break;
        case "settlements":
          params.type = "employee_advance";
          params.status = "approved";
          break;
      }

      // Apply filters
      if (appliedFilters.status && appliedFilters.status !== "all") {
        params.status = appliedFilters.status;
      }
      if (appliedFilters.type && appliedFilters.type !== "all") {
        params.type = appliedFilters.type;
      }
      if (appliedFilters.month && appliedFilters.month !== "all") {
        params.month = Number(appliedFilters.month);
      }
      if (appliedFilters.year && appliedFilters.year !== "all") {
        params.year = Number(appliedFilters.year);
      }
      if (appliedFilters.search) {
        params.search = appliedFilters.search;
      }

      const data = await fetchExpenses(params as Parameters<typeof fetchExpenses>[0]);
      setExpenses(data);
    } catch (err) {
      console.error("Failed to fetch expenses:", err);
      toast.error("Failed to load expenses. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, userId, userRole, userUnitId, appliedFilters]);

  const loadDashboard = useCallback(async () => {
    setIsDashboardLoading(true);
    try {
      let params: Record<string, string | number | undefined> = {
        action: "dashboard",
      };

      if (userRole === "employee") {
        params.employee_id = userId;
      } else if (userRole === "manager") {
        params.manager_id = userId;
      } else {
        params.unit_id = userUnitId;
      }

      const data = await fetchDashboard(params as Parameters<typeof fetchDashboard>[0]);
      setDashboard(data);
    } catch (err) {
      console.error("Failed to fetch dashboard:", err);
    } finally {
      setIsDashboardLoading(false);
    }
  }, [userId, userRole, userUnitId]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const handleResetFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
  };

  const handleFormChange = (key: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleOpenSubmitDialog = () => {
    setFormData({ ...EMPTY_FORM });
    setSubmitDialogOpen(true);
  };

  const handleSubmitExpense = async () => {
    if (!formData.category || !formData.amount || !formData.expense_date) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const isAdvance = formData.type === "employee_advance";
      const empName = isAdvance && (userRole === "manager" || userRole === "admin")
        ? formData.emp_name
        : userName;
      const empCode = isAdvance && (userRole === "manager" || userRole === "admin")
        ? formData.emp_code
        : userEmpCode;

      const payload = {
        action: "create" as const,
        employee_id: userId,
        manager_id: managerId,
        emp_name: empName,
        emp_code: empCode,
        unit_id: userUnitId,
        month: Number(formData.month),
        year: Number(formData.year),
        category: formData.category,
        type: formData.type as "expense" | "employee_advance",
        amount: parseFloat(formData.amount),
        description: formData.description,
        expense_date: formData.expense_date,
      };

      const result = await createExpense(payload);

      if (result.success) {
        toast.success("Expense submitted successfully!");
        setSubmitDialogOpen(false);
        setFormData({ ...EMPTY_FORM });
        loadExpenses();
        loadDashboard();
      } else {
        toast.error("Failed to submit expense. Please try again.");
      }
    } catch (err) {
      console.error("Submit expense error:", err);
      toast.error("An error occurred while submitting the expense.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    setViewDialogOpen(true);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      category: expense.category,
      type: expense.type,
      amount: String(expense.amount),
      description: expense.description,
      expense_date: expense.expense_date,
      month: String(expense.month),
      year: String(expense.year),
      emp_name: expense.emp_name,
      emp_code: expense.emp_code,
    });
    setEditDialogOpen(true);
  };

  const handleUpdateExpense = async () => {
    if (!editingExpense) return;
    if (!formData.amount || !formData.expense_date || !formData.category) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateExpense(editingExpense.id, {
        category: formData.category,
        type: formData.type,
        amount: parseFloat(formData.amount),
        description: formData.description,
        expense_date: formData.expense_date,
        month: Number(formData.month),
        year: Number(formData.year),
        edited_by: userId,
      });

      if (result.success) {
        toast.success("Expense updated successfully!");
        setEditDialogOpen(false);
        setEditingExpense(null);
        loadExpenses();
      } else {
        toast.error("Failed to update expense.");
      }
    } catch (err) {
      console.error("Update expense error:", err);
      toast.error("An error occurred while updating.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    setApproveDialogOpen(true);
  };

  const confirmApprove = async () => {
    if (!selectedExpense) return;

    try {
      const result = await approveExpense(selectedExpense.id, userId);
      if (result.success) {
        toast.success("Expense approved successfully!");
        setApproveDialogOpen(false);
        setSelectedExpense(null);
        loadExpenses();
        loadDashboard();
      } else {
        toast.error("Failed to approve expense.");
      }
    } catch (err) {
      console.error("Approve error:", err);
      toast.error("An error occurred.");
    }
  };

  const handleRejectExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (!selectedExpense) return;
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection.");
      return;
    }

    try {
      const result = await rejectExpense(
        selectedExpense.id,
        userId,
        rejectionReason.trim()
      );
      if (result.success) {
        toast.success("Expense rejected.");
        setRejectDialogOpen(false);
        setSelectedExpense(null);
        setRejectionReason("");
        loadExpenses();
        loadDashboard();
      } else {
        toast.error("Failed to reject expense.");
      }
    } catch (err) {
      console.error("Reject error:", err);
      toast.error("An error occurred.");
    }
  };

  // ── Tab configs ────────────────────────────────────────────────────────

  const getTabConfig = useMemo(() => {
    switch (userRole) {
      case "employee":
        return [
          { value: "my-expenses", label: "My Expenses", icon: Receipt },
          { value: "my-advances", label: "My Advances", icon: Wallet },
        ];
      case "manager":
        return [
          {
            value: "pending-approvals",
            label: "Pending Approvals",
            icon: ClipboardCheck,
          },
          { value: "team-expenses", label: "Team Expenses", icon: Users },
        ];
      case "admin":
        return [
          { value: "all-expenses", label: "All Expenses", icon: Receipt },
          {
            value: "pending-approvals",
            label: "Pending Approvals",
            icon: ClipboardCheck,
          },
          {
            value: "settlements",
            label: "Settlements",
            icon: ArrowUpDown,
          },
        ];
    }
  }, [userRole]);

  // ── Computed values ────────────────────────────────────────────────────

  const totalFilteredAmount = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100">
              <Receipt className="size-5 text-emerald-700" />
            </div>
            Expense Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {userRole === "employee"
              ? "Submit and track your expenses and advance requests."
              : userRole === "manager"
                ? "Review and manage your team's expense submissions."
                : "Manage all expense records and approvals across the organization."}
          </p>
        </div>

        {(userRole === "employee" || userRole === "manager" || userRole === "admin") && (
          <Button
            onClick={handleOpenSubmitDialog}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="size-4" />
            Submit Expense
          </Button>
        )}
      </div>

      {/* Dashboard Summary Cards */}
      <DashboardSummaryCards data={dashboard} isLoading={isDashboardLoading} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          {getTabConfig.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                <Icon className="size-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {getTabConfig.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4 space-y-4">
            {/* Filter Bar */}
            <FilterBar
              filters={filters}
              onFilterChange={handleFilterChange}
              onApply={handleApplyFilters}
              onReset={handleResetFilters}
              showTypeFilter={
                !(
                  activeTab === "my-expenses" ||
                  activeTab === "my-advances"
                )
              }
            />

            {/* Results Summary */}
            {!isLoading && expenses.length > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Total:{" "}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(totalFilteredAmount)}
                  </span>{" "}
                  across {expenses.length} {expenses.length === 1 ? "entry" : "entries"}
                </span>
              </div>
            )}

            {/* Expense List */}
            <ExpenseTable
              expenses={expenses}
              userRole={userRole}
              onView={handleViewExpense}
              onEdit={handleEditExpense}
              onApprove={handleApproveExpense}
              onReject={handleRejectExpense}
              isLoading={isLoading}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Submit Expense Dialog */}
      <SubmitExpenseDialog
        open={submitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        formData={formData}
        onFormChange={handleFormChange}
        onSubmit={handleSubmitExpense}
        isSubmitting={isSubmitting}
        userRole={userRole}
        userName={userName}
        userEmpCode={userEmpCode}
      />

      {/* Edit Expense Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="size-5 text-slate-600" />
              Edit Expense
            </DialogTitle>
            <DialogDescription>
              Update the details for expense #{editingExpense?.id}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            {/* Type */}
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(v) => handleFormChange("type", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="employee_advance">Employee Advance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Category</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = formData.category === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => handleFormChange("category", cat.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-xs font-medium transition-all hover:shadow-sm ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-transparent bg-muted/50 hover:border-muted-foreground/20"
                      }`}
                    >
                      <div className={`flex size-8 items-center justify-center rounded-lg ${cat.color}`}>
                        <Icon className="size-4" />
                      </div>
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount */}
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Amount (INR)</Label>
              <div className="relative">
                <IndianRupee className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => handleFormChange("amount", e.target.value)}
                  className="pl-9"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => handleFormChange("description", e.target.value)}
                rows={3}
              />
            </div>

            {/* Date & Month/Year */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Expense Date</Label>
                <Input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => handleFormChange("expense_date", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Month</Label>
                <Select
                  value={formData.month}
                  onValueChange={(v) => handleFormChange("month", v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Year</Label>
                <Select
                  value={formData.year}
                  onValueChange={(v) => handleFormChange("year", v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleUpdateExpense} disabled={isSubmitting} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {isSubmitting ? (
                <>
                  <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Expense Dialog */}
      <ViewExpenseDialog
        expense={selectedExpense}
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
      />

      {/* Approve Confirmation */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              Approve Expense
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this expense of{" "}
              <span className="font-semibold text-foreground">
                {selectedExpense ? formatCurrency(selectedExpense.amount) : ""}
              </span>{" "}
              submitted by{" "}
              <span className="font-semibold text-foreground">
                {selectedExpense?.emp_name ?? ""}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmApprove}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Yes, Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="size-5 text-red-600" />
              Reject Expense
            </DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this expense of{" "}
              <span className="font-semibold text-foreground">
                {selectedExpense ? formatCurrency(selectedExpense.amount) : ""}
              </span>{" "}
              submitted by{" "}
              <span className="font-semibold text-foreground">
                {selectedExpense?.emp_name ?? ""}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-sm font-medium">
                Rejection Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                placeholder="Explain why this expense is being rejected..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                className="border-red-200 focus-visible:ring-red-500/30"
              />
              <p className="text-xs text-muted-foreground">
                This reason will be visible to the employee.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!rejectionReason.trim()}
              className="gap-2"
            >
              <XCircle className="size-4" />
              Reject Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
