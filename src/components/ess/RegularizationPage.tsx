'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  FileEdit,
  CalendarDays,
  Loader2,
  Send,
  Inbox,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PageHeader from './PageHeader';

// ══════════════════════════════════════════════════════════════
// RegularizationPage — Attendance Regularization
// ══════════════════════════════════════════════════════════════

interface RegularizationPageProps {
  employeeId: number;
}

const REGULARIZATION_TYPES = [
  { value: 'forgot_checkin', label: 'Forgot Check-in' },
  { value: 'forgot_checkout', label: 'Forgot Check-out' },
  { value: 'worked_remotely', label: 'Worked Remotely' },
  { value: 'system_error', label: 'System Error' },
  { value: 'other', label: 'Other' },
];

export default function RegularizationPage({ employeeId }: RegularizationPageProps) {
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    reason: '',
    type: '',
  });

  const handleReset = () => {
    setForm({
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
      reason: '',
      type: '',
    });
  };

  const handleSubmit = async () => {
    if (!form.date) {
      toast.error('Please select a date');
      return;
    }
    if (!form.type) {
      toast.error('Please select a regularization type');
      return;
    }
    if (!form.reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }

    setSubmitting(true);
    // Simulate API call (backend doesn't support this yet)
    await new Promise((resolve) => setTimeout(resolve, 800));
    toast.success('Regularization request submitted successfully');
    handleReset();
    setSubmitting(false);
  };

  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Attendance Regularization"
        subtitle="Regularize missed check-ins and check-outs"
      />

      {/* Form Card */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-4">
          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="reg-date">Date</Label>
            <Input
              id="reg-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              max={todayIST}
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="reg-type">Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
            >
              <SelectTrigger id="reg-type">
                <SelectValue placeholder="Select regularization type" />
              </SelectTrigger>
              <SelectContent>
                {REGULARIZATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reg-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reg-reason"
              placeholder="Explain the reason for regularization..."
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              rows={4}
              maxLength={500}
            />
          </div>

          {/* Submit */}
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            onClick={handleSubmit}
            disabled={submitting || !form.type || !form.reason.trim()}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </CardContent>
      </Card>

      {/* Past Requests (Placeholder) */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Past Requests
          </h3>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No regularization requests yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Your submitted requests will appear here
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
