'use client';

import { toast } from 'sonner';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  Receipt,
  CalendarDays,
  ListTodo,
  CircleHelp,
  Info,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageHeader from './PageHeader';
import type { Notification } from './hooks/useNotifications';

// ══════════════════════════════════════════════════════════════
// NotificationsPage Component
// ══════════════════════════════════════════════════════════════

interface NotificationsPageProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
}

const TYPE_CONFIG: Record<string, { icon: typeof Info; color: string; badgeClass: string }> = {
  leave: { icon: CalendarDays, color: 'text-emerald-600', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  expense: { icon: Receipt, color: 'text-amber-600', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' },
  task: { icon: ListTodo, color: 'text-violet-600', badgeClass: 'bg-violet-100 text-violet-700 border-violet-200' },
  helpdesk: { icon: CircleHelp, color: 'text-sky-600', badgeClass: 'bg-sky-100 text-sky-700 border-sky-200' },
  general: { icon: Info, color: 'text-gray-600', badgeClass: 'bg-gray-100 text-gray-700 border-gray-200' },
};

function formatTimestamp(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function NotificationsPage({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllRead,
  onClearAll,
}: NotificationsPageProps) {
  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
      />

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => {
                onMarkAllRead();
                toast.success('All marked as read');
              }}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark All Read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1.5"
              onClick={() => {
                onClearAll();
                toast.success('All notifications cleared');
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <BellOff className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-1">No Notifications</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              You&apos;re all caught up! Notifications about your leaves, expenses, tasks, and tickets will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkAsRead={onMarkAsRead}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notification Card ──
function NotificationCard({
  notification,
  onMarkAsRead,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}) {
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.general;
  const TypeIcon = config.icon;

  return (
    <Card
      className={`border transition-colors cursor-pointer ${
        notification.read
          ? 'bg-white'
          : 'bg-emerald-50/40 border-emerald-200/60'
      }`}
      onClick={() => {
        if (!notification.read) {
          onMarkAsRead(notification.id);
        }
      }}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex items-center justify-center w-9 h-9 rounded-lg bg-muted shrink-0 mt-0.5 ${notification.read ? 'opacity-60' : ''}`}
          >
            <TypeIcon className={`w-4.5 h-4.5 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <h4 className={`text-sm font-semibold truncate ${notification.read ? 'text-gray-500' : 'text-gray-900'}`}>
                {notification.title}
              </h4>
              {!notification.read && (
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
              )}
            </div>
            <p className={`text-xs mb-1.5 line-clamp-2 ${notification.read ? 'text-muted-foreground' : 'text-gray-600'}`}>
              {notification.message}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                {formatTimestamp(notification.timestamp)}
              </span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.badgeClass}`}>
                {notification.type}
              </Badge>
            </div>
          </div>
          {!notification.read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsRead(notification.id);
              }}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
