import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Clock,
  Loader2,
  CheckCircle2,
  Plus,
  CircleDot,
  TicketCheck,
  Inbox,
  AlertCircle,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { fetchHelpdeskTickets, createHelpdeskTicket } from '@/lib/ess-api';
import type { HelpdeskTicket } from '@/lib/ess-types';
import { HELPDESK_CATEGORIES, HELPDESK_STATUSES } from '@/lib/ess-types';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Props ──────────────────────────────────────────────
interface HelpdeskPageProps {
  employeeId: string | number;
  employeeName: string;
}

// ── Constants ──────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  IT: 'bg-sky-100 text-sky-700 border-sky-200',
  HR: 'bg-rose-100 text-rose-700 border-rose-200',
  Admin: 'bg-amber-100 text-amber-700 border-amber-200',
  Facility: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Payroll: 'bg-violet-100 text-violet-700 border-violet-200',
  Other: 'bg-slate-100 text-slate-700 border-slate-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700 border-rose-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700 border-amber-200',
  in_progress: 'bg-sky-100 text-sky-700 border-sky-200',
  resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  open: Clock,
  in_progress: Loader2,
  resolved: CheckCircle2,
  closed: TicketCheck,
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const FILTER_CHIPS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

// ── Component ──────────────────────────────────────────
export default function HelpdeskPage({ employeeId, employeeName }: HelpdeskPageProps) {
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Form state ──
  const [formCategory, setFormCategory] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState('medium');

  // ── Fetch tickets ──
  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHelpdeskTickets(employeeId, activeFilter || undefined);
      setTickets(res.items ?? []);
    } catch (err) {
      console.error('Failed to fetch helpdesk tickets:', err);
      setError('Failed to load tickets. Please try again.');
      toast.error('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [employeeId, activeFilter]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // ── Reset form ──
  const resetForm = () => {
    setFormCategory('');
    setFormSubject('');
    setFormDescription('');
    setFormPriority('medium');
  };

  // ── Submit ticket ──
  const handleSubmit = async () => {
    if (!formCategory) {
      toast.error('Please select a category');
      return;
    }
    if (!formSubject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    setSubmitting(true);
    try {
      await createHelpdeskTicket({
        employee_id: employeeId,
        category: formCategory,
        subject: formSubject.trim(),
        description: formDescription.trim() || undefined,
        priority: formPriority,
      });
      toast.success('Ticket submitted successfully');
      setDialogOpen(false);
      resetForm();
      loadTickets();
    } catch (err) {
      console.error('Failed to create ticket:', err);
      toast.error('Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filtered tickets ──
  const filteredTickets = activeFilter
    ? tickets.filter((t) => t.status === activeFilter)
    : tickets;

  // ── Format date ──
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // ── Render ──
  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Helpdesk</h2>
          <p className="text-sm text-muted-foreground">
            Submit and track support tickets
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Submit New Ticket</DialogTitle>
              <DialogDescription>
                Describe your issue and our support team will assist you.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-2">
              {/* Category */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="ticket-category">Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger id="ticket-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {HELPDESK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="ticket-subject">Subject</Label>
                <Input
                  id="ticket-subject"
                  placeholder="Brief summary of your issue"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  maxLength={200}
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="ticket-description">Description</Label>
                <Textarea
                  id="ticket-description"
                  placeholder="Provide details about your issue..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={4}
                  maxLength={2000}
                />
              </div>

              {/* Priority */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="ticket-priority">Priority</Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger id="ticket-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setDialogOpen(false); resetForm(); }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Ticket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setActiveFilter(chip.value)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              activeFilter === chip.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {chip.value && (
              <StatusIconChip status={chip.value} className="h-3.5 w-3.5" />
            )}
            {chip.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={loadTickets}>
            Retry
          </Button>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-muted-foreground">No tickets yet</p>
            <p className="text-sm text-muted-foreground/70">
              {activeFilter
                ? `No ${STATUS_LABELS[activeFilter]?.toLowerCase()} tickets found`
                : 'Submit a new ticket to get help from our support team'}
            </p>
          </div>
          {!activeFilter && (
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Ticket
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea className="h-auto">
          <div className="flex flex-col gap-3">
            {filteredTickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} formatDate={formatDate} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── Status Icon for Chips ──────────────────────────────
function StatusIconChip({ status, className }: { status: string; className?: string }) {
  const Icon = STATUS_ICONS[status] || CircleDot;
  return <Icon className={className} />;
}

// ── Ticket Card ────────────────────────────────────────
function TicketCard({
  ticket,
  formatDate,
}: {
  ticket: HelpdeskTicket;
  formatDate: (d?: string) => string;
}) {
  const StatusIcon = STATUS_ICONS[ticket.status] || CircleDot;
  const statusLabel = STATUS_LABELS[ticket.status] || ticket.status;

  return (
    <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30">
      {/* Top row: category + priority */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge
          variant="outline"
          className={cn('text-xs', CATEGORY_COLORS[ticket.category] || '')}
        >
          {ticket.category}
        </Badge>
        <Badge
          variant="outline"
          className={cn('text-xs', PRIORITY_COLORS[ticket.priority] || '')}
        >
          {ticket.priority}
        </Badge>
      </div>

      {/* Subject */}
      <h3 className="font-semibold text-sm leading-snug mb-1">{ticket.subject}</h3>

      {/* Description */}
      {ticket.description && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {ticket.description}
        </p>
      )}

      <Separator className="my-2" />

      {/* Bottom row: status + date */}
      <div className="flex items-center justify-between">
        <Badge
          variant="outline"
          className={cn('gap-1 text-xs', STATUS_COLORS[ticket.status] || '')}
        >
          <StatusIcon className="h-3 w-3" />
          {statusLabel}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatDate(ticket.created_at)}
        </span>
      </div>
    </div>
  );
}
