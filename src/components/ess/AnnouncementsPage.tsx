import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Megaphone,
  Plus,
  Loader2,
  AlertCircle,
  Users,
  Building2,
  MapPin,
  Inbox,
  Shield,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { fetchAnnouncements, createAnnouncement } from '@/lib/ess-api';
import type { Announcement } from '@/lib/ess-types';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
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
interface AnnouncementsPageProps {
  employeeId: string | number;
  role: string;
  canPost: boolean;
}

// ── Constants ──────────────────────────────────────────
type AnnouncementPriority = Announcement['priority'];
type AnnouncementScope = Announcement['target_scope'];

const PRIORITY_BORDER: Record<AnnouncementPriority, string> = {
  urgent: 'border-l-4 border-l-red-500',
  high: 'border-l-4 border-l-amber-500',
  normal: 'border-l-4 border-l-slate-400',
  low: 'border-l-4 border-l-gray-300',
};

const PRIORITY_BADGE: Record<AnnouncementPriority, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  normal: 'bg-slate-100 text-slate-600 border-slate-200',
  low: 'bg-gray-100 text-gray-500 border-gray-200',
};

const SCOPE_BADGE: Record<AnnouncementScope, string> = {
  all: 'bg-blue-100 text-blue-700 border-blue-200',
  managers: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-amber-100 text-amber-700 border-amber-200',
};

const SCOPE_LABEL: Record<AnnouncementScope, string> = {
  all: 'All',
  managers: 'Managers',
  admin: 'Admin',
};

const SCOPE_ICON: Record<AnnouncementScope, typeof Users> = {
  all: Users,
  managers: Shield,
  admin: Building2,
};

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All (Unit Employees)' },
  { value: 'managers', label: 'Managers Only' },
  { value: 'admin', label: 'Admin Only' },
];

// ── Component ──────────────────────────────────────────
export default function AnnouncementsPage({
  employeeId,
  role,
  canPost,
}: AnnouncementsPageProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Form state ──
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPriority, setFormPriority] = useState<AnnouncementPriority>('normal');
  const [formScope, setFormScope] = useState<AnnouncementScope>('all');

  // ── Fetch announcements ──
  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchAnnouncements();
      const paginated = data as Record<string, unknown> | undefined;
      const items = Array.isArray(data) ? data : (Array.isArray(paginated?.items) ? paginated.items : []);
      setAnnouncements(items);
    } catch (err) {
      console.error('Failed to fetch announcements:', err);
      setError('Failed to load announcements. Please try again.');
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  // ── Reset form ──
  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormPriority('normal');
    setFormScope('all');
  };

  // ── Submit announcement ──
  const handleSubmit = async () => {
    if (!formTitle.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!formContent.trim()) {
      toast.error('Please enter the announcement content');
      return;
    }

    setSubmitting(true);
    try {
      await createAnnouncement({
        title: formTitle.trim(),
        content: formContent.trim(),
        priority: formPriority,
        target_scope: formScope,
        created_by: String(employeeId),
      });
      toast.success('Announcement posted successfully');
      setDialogOpen(false);
      resetForm();
      loadAnnouncements();
    } catch (err) {
      console.error('Failed to create announcement:', err);
      toast.error('Failed to post announcement');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Format date ──
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // ── Render ──
  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Announcements</h2>
          <p className="text-sm text-muted-foreground">
            Stay updated with the latest company news
          </p>
        </div>

        {canPost && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 w-full sm:w-auto">
                <Megaphone className="h-4 w-4" />
                Post Announcement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Post Announcement</DialogTitle>
                <DialogDescription>
                  Share an announcement with employees.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4 py-2">
                {/* Title */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ann-title">Title</Label>
                  <Input
                    id="ann-title"
                    placeholder="Announcement title"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    maxLength={200}
                  />
                </div>

                {/* Content */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ann-content">Content</Label>
                  <Textarea
                    id="ann-content"
                    placeholder="Write the announcement details..."
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    rows={6}
                    maxLength={5000}
                  />
                </div>

                {/* Priority + Scope in a row on larger screens */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Priority */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ann-priority">Priority</Label>
                    <Select
                      value={formPriority}
                      onValueChange={(v) => setFormPriority(v as AnnouncementPriority)}
                    >
                      <SelectTrigger id="ann-priority">
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

                  {/* Target Scope */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ann-scope">Target Scope</Label>
                    <Select
                      value={formScope}
                      onValueChange={(v) => setFormScope(v as AnnouncementScope)}
                    >
                      <SelectTrigger id="ann-scope">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCOPE_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                  Post
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={loadAnnouncements}>
            Retry
          </Button>
        </div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-muted-foreground">No announcements</p>
            <p className="text-sm text-muted-foreground/70">
              There are no announcements at this time
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="h-auto">
          <div className="flex flex-col gap-3">
            {announcements.map((ann) => (
              <AnnouncementCard
                key={ann.id}
                announcement={ann}
                formatDate={formatDate}
                formatTime={formatTime}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── Announcement Card ──────────────────────────────────
function AnnouncementCard({
  announcement,
  formatDate,
  formatTime,
}: {
  announcement: Announcement;
  formatDate: (d?: string) => string;
  formatTime: (d?: string) => string;
}) {
  const ScopeIcon = SCOPE_ICON[announcement.target_scope] || Users;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30',
        PRIORITY_BORDER[announcement.priority]
      )}
    >
      {/* Top row: priority badge + scope badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge
          variant="outline"
          className={cn('text-xs', PRIORITY_BADGE[announcement.priority])}
        >
          {announcement.priority.charAt(0).toUpperCase() + announcement.priority.slice(1)}
        </Badge>
        <Badge
          variant="outline"
          className={cn('gap-1 text-xs', SCOPE_BADGE[announcement.target_scope])}
        >
          <ScopeIcon className="h-3 w-3" />
          {SCOPE_LABEL[announcement.target_scope]}
        </Badge>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-sm leading-snug mb-2">{announcement.title}</h3>

      {/* Content */}
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {announcement.content}
      </p>

      {/* Creator + date */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t">
        <span className="text-xs text-muted-foreground">
          {announcement.creator_name ? `By ${announcement.creator_name}` : ''}
        </span>
        <span className="text-xs text-muted-foreground">
          {announcement.created_at && (
            <>
              {formatDate(announcement.created_at)}
              {formatTime(announcement.created_at) && (
                <span className="ml-1.5 text-muted-foreground/70">
                  {formatTime(announcement.created_at)}
                </span>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
