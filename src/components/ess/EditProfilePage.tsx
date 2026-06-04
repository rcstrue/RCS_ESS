'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import type { Employee } from '@/lib/ess-types';

// ══════════════════════════════════════════════════════════════
// EditProfilePage Component
// ══════════════════════════════════════════════════════════════

interface EditProfilePageProps {
  employee: Employee;
  onSave: (updated: Partial<Employee>) => void;
  onBack: () => void;
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widowed'];
const RELATIONS = ['spouse', 'parent', 'sibling', 'friend'];

export default function EditProfilePage({ employee, onSave, onBack }: EditProfilePageProps) {
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    presentAddress: employee.address || '',
    permanentAddress: employee.address || '',
    emergencyContactName: employee.emergency_contact_name || '',
    emergencyContactRelation: employee.emergency_contact_relation || '',
    emergencyContactNumber: employee.nominee_contact || '',
    personalEmail: employee.email || '',
    bloodGroup: employee.blood_group || '',
    maritalStatus: employee.marital_status || '',
  });

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 800));
    onSave({
      address: form.presentAddress,
      emergency_contact_name: form.emergencyContactName,
      emergency_contact_relation: form.emergencyContactRelation,
      nominee_contact: form.emergencyContactNumber,
      email: form.personalEmail,
      blood_group: form.bloodGroup,
      marital_status: form.maritalStatus,
    });
    setSaving(false);
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4 pb-6">
      <PageHeader title="Edit Profile" subtitle="Update your personal information" />

      {/* Contact Information */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Contact Information</h3>

          {/* Present Address */}
          <div className="space-y-2">
            <Label htmlFor="present-address">Present Address</Label>
            <Textarea
              id="present-address"
              placeholder="Enter your present address"
              value={form.presentAddress}
              onChange={(e) => updateField('presentAddress', e.target.value)}
              rows={3}
            />
          </div>

          {/* Permanent Address */}
          <div className="space-y-2">
            <Label htmlFor="permanent-address">Permanent Address</Label>
            <Textarea
              id="permanent-address"
              placeholder="Enter your permanent address"
              value={form.permanentAddress}
              onChange={(e) => updateField('permanentAddress', e.target.value)}
              rows={3}
            />
          </div>

          {/* Personal Email */}
          <div className="space-y-2">
            <Label htmlFor="personal-email">Personal Email</Label>
            <Input
              id="personal-email"
              type="email"
              placeholder="your@email.com"
              value={form.personalEmail}
              onChange={(e) => updateField('personalEmail', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Emergency Contact</h3>

          {/* Emergency Contact Name */}
          <div className="space-y-2">
            <Label htmlFor="emergency-name">Contact Name</Label>
            <Input
              id="emergency-name"
              placeholder="Emergency contact person's name"
              value={form.emergencyContactName}
              onChange={(e) => updateField('emergencyContactName', e.target.value)}
            />
          </div>

          {/* Emergency Contact Number */}
          <div className="space-y-2">
            <Label htmlFor="emergency-number">Contact Number</Label>
            <Input
              id="emergency-number"
              type="tel"
              placeholder="+91 XXXXX XXXXX"
              value={form.emergencyContactNumber}
              onChange={(e) => updateField('emergencyContactNumber', e.target.value)}
            />
          </div>

          {/* Emergency Contact Relation */}
          <div className="space-y-2">
            <Label htmlFor="emergency-relation">Relationship</Label>
            <Select
              value={form.emergencyContactRelation}
              onValueChange={(v) => updateField('emergencyContactRelation', v)}
            >
              <SelectTrigger id="emergency-relation">
                <SelectValue placeholder="Select relationship" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONS.map((rel) => (
                  <SelectItem key={rel} value={rel}>
                    {rel.charAt(0).toUpperCase() + rel.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Personal Details */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Personal Details</h3>

          {/* Blood Group */}
          <div className="space-y-2">
            <Label htmlFor="blood-group">Blood Group</Label>
            <Select
              value={form.bloodGroup}
              onValueChange={(v) => updateField('bloodGroup', v)}
            >
              <SelectTrigger id="blood-group">
                <SelectValue placeholder="Select blood group" />
              </SelectTrigger>
              <SelectContent>
                {BLOOD_GROUPS.map((bg) => (
                  <SelectItem key={bg} value={bg}>
                    {bg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Marital Status */}
          <div className="space-y-2">
            <Label htmlFor="marital-status">Marital Status</Label>
            <Select
              value={form.maritalStatus}
              onValueChange={(v) => updateField('maritalStatus', v)}
            >
              <SelectTrigger id="marital-status">
                <SelectValue placeholder="Select marital status" />
              </SelectTrigger>
              <SelectContent>
                {MARITAL_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onBack}
          disabled={saving}
        >
          <X className="w-4 h-4 mr-1.5" />
          Cancel
        </Button>
        <Button
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
          ) : (
            <Save className="w-4 h-4 mr-1.5" />
          )}
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
