import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Search,
  Send,
  MessageSquare,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { fetchHelpdeskTickets, createHelpdeskTicket } from '@/lib/ess-api';
import type { HelpdeskTicket } from '@/lib/ess-types';
import { HELPDESK_CATEGORIES, HELPDESK_STATUSES } from '@/lib/ess-types';
import { usePullToRefresh } from './hooks/usePullToRefresh';

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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

// ── Props ──────────────────────────────────────────────
interface HelpdeskPageProps {
  employeeId: number;
  employeeName?: string;
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

// ── Reply types ──
interface HelpdeskReply {
  id: string;
  message: string;
  timestamp: string;
  senderType: 'Employee' | 'Admin' | 'System';
  senderName?: string;
}

function getHelpdeskReplies(ticketId: number): HelpdeskReply[] {
  try {
    const raw = localStorage.getItem(`ess_helpdesk_replies_${ticketId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHelpdeskReply(ticketId: number, replies: HelpdeskReply[]) {
  localStorage.setItem(`ess_helpdesk_replies_${ticketId}`, JSON.stringify(replies));
}

function getReplyCount(ticketId: number): number {
  return getHelpdeskReplies(ticketId).length;
}

// ── Component ──────────────────────────────────────────
export default function HelpdeskPage({ employeeId, employeeName = 'Employee' }: HelpdeskPageProps) {
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState('');

  // ── Reply sheet state ──
  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);
  const [replies, setReplies] = useState<HelpdeskReply[]>([]);
  const [replyText, setReplyText] = useState('');

  // ── Form state ──
  const [formCategory, setFormCategory] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState('medium');

  // Pull-to-refresh
  const pullRefresh = usePullToRefresh<HTMLDivElement>({
    onRefresh: loadTickets,
  });

  // ── Fetch tickets ──
  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fetchError } = await fetchHelpdeskTickets(employeeId, activeFilter || undefined);
      if (fetchError) {
        toast.error(fetchError);
        return;
      }
      setTickets(res?.items ?? []);
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

  // ── Filtered tickets (client-side search) ──
  const filteredTickets = useMemo(() => {
    if (!searchText.trim()) return tickets;
    const q = searchText.toLowerCase();
    return tickets.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
    );
  }, [tickets, searchText]);

  // ── Open reply sheet ──
  const openReplySheet = (ticket: HelpdeskTicket) => {
    setSelectedTicket(ticket);
    setReplies(getHelpdeskReplies(ticket.id));
    setReplyText('');
  };

  // ── Add reply ──
  const handleAddReply = () => {
    if (!selectedTicket || !replyText.trim()) return;
    const newReply: HelpdeskReply = {
      id: Date.now().toString(),
      message: replyText.trim(),
      timestamp: new Date().toISOString(),
      senderType: 'Employee',
      senderName: employeeName,
    };
    const updated = [...replies, newReply];
    saveHelpdeskReplies(selectedTicket.id, updated);
    setReplies(updated);
    setReplyText('');
    toast.success('Reply added');
  };

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
      const { error: submitError } = await createHelpdeskTicket({
        employee_id: employeeId,
        category: formCategory,
        subject: formSubject.trim(),
        description: formDescription.trim() || undefined,
        priority: formPriority,
      });
      if (submitError) {
        toast.error(submitError);
        return;
      }
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

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

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

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tickets by subject, category..."
          className="pl-9 h-9"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        {searchText && (
          <button
            onClick={() => setSearchText('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
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
            <p className="font-medium text-muted-foreground">
              {searchText ? 'No tickets match your search' : 'No tickets yet'}
            </p>
            <p className="text-sm text-muted-foreground/70">
              {searchText
                ? 'Try adjusting your search terms'
                : activeFilter
                  ? `No ${STATUS_LABELS[activeFilter]?.toLowerCase()} tickets found`
                  : 'Submit a new ticket to get help from our support team'}
            </p>
          </div>
          {!activeFilter && !searchText && (
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
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                formatDate={formatDate}
                replyCount={getReplyCount(ticket.id)}
                onTap={() => openReplySheet(ticket)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Reply Thread Sheet */}
      <Sheet open={!!selectedTicket} onOpenChange={(open) => { if (!open) setSelectedTicket(null); }}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-left">Ticket Details</SheetTitle>
            <SheetDescription className="text-left truncate">
              {selectedTicket?.subject}
            </SheetDescription>
          </SheetHeader>

          {selectedTicket && (
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* Ticket info */}
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn('text-xs', CATEGORY_COLORS[selectedTicket.category] || '')}>
                    {selectedTicket.category}
                  </Badge>
                  <Badge variant="outline" className={cn('text-xs', PRIORITY_COLORS[selectedTicket.priority] || '')}>
                    {selectedTicket.priority}
                  </Badge>
                  <Badge variant="outline" className={cn('gap-1 text-xs', STATUS_COLORS[selectedTicket.status] || '')}>
                    {STATUS_LABELS[selectedTicket.status] || selectedTicket.status}
                  </Badge>
                </div>
                {selectedTicket.description && (
                  <p className="text-sm text-muted-foreground">{selectedTicket.description}</p>
                )}
                <p className="text-xs text-muted-foreground">Created: {formatDate(selectedTicket.created_at)}</p>
              </div>

              <Separator />

              {/* Conversation thread */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Conversation ({replies.length})
                </h4>

                {replies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No replies yet</p>
                  </div>
                ) : (
                  replies.map((reply) => (
                    <div
                      key={reply.id}
                      className={cn(
                        'rounded-lg border p-3',
                        reply.senderType === 'System'
                          ? 'bg-muted/50 border-dashed'
                          : reply.senderType === 'Admin'
                            ? 'bg-sky-50 border-sky-100'
                            : 'bg-emerald-50 border-emerald-100'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5',
                              reply.senderType === 'System'
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : reply.senderType === 'Admin'
                                  ? 'bg-sky-100 text-sky-700 border-sky-200'
                                  : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            )}
                          >
                            {reply.senderType}
                          </Badge>
                          {reply.senderName && (
                            <span className="text-xs font-medium">{reply.senderName}</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(reply.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm">{reply.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Add Reply */}
          {(selectedTicket?.status === 'open' || selectedTicket?.status === 'in_progress') && (
            <div className="border-t pt-3 pb-safe">
              <div className="flex gap-2">
                <Input
                  placeholder="Type your reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddReply(); } }}
                />
                <Button size="icon" disabled={!replyText.trim()} onClick={handleAddReply}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
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
  replyCount,
  onTap,
}: {
  ticket: HelpdeskTicket;
  formatDate: (d?: string) => string;
  replyCount: number;
  onTap: () => void;
}) {
  const StatusIcon = STATUS_ICONS[ticket.status] || CircleDot;
  const statusLabel = STATUS_LABELS[ticket.status] || ticket.status;

  return (
    <div
      className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30 cursor-pointer"
      onClick={onTap}
    >
      {/* Top row: category + priority */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge
          variant="outline"
          className={cn('text-xs', CATEGORY_COLORS[ticket.category] || '')}
        >
          {ticket.category}
        </Badge>
        <div className="flex items-center gap-1.5">
          {replyCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1">
              {replyCount}
            </span>
          )}
          <Badge
            variant="outline"
            className={cn('text-xs', PRIORITY_COLORS[ticket.priority] || '')}
          >
            {ticket.priority}
          </Badge>
        </div>
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
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {formatDate(ticket.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
