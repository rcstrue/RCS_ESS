'use client';

import { getRoleBadge, getInitials, formatDate } from './helpers';
import { getFileUrl } from '@/lib/api/config';
import type { Employee, EmployeeRole } from '@/lib/ess-types';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  UserCircle,
  Building2,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  Settings,
  Leaf,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// ProfileView Component
// ══════════════════════════════════════════════════════════════

export default function ProfileView({
  employee,
  role,
  onNavigate,
}: {
  employee: Employee;
  role: EmployeeRole;
  onNavigate: (page: string) => void;
}) {
  const roleBadge = getRoleBadge(role);
  const initials = getInitials(employee.full_name || 'U');

  const profileFields: { icon: React.ElementType; label: string; value: string }[] = [
    { icon: Shield, label: 'Employee Code', value: employee.employee_code || `EMP-${employee.id}` },
    { icon: UserCircle, label: 'Designation', value: employee.designation || '—' },
    { icon: Building2, label: 'Department', value: employee.department || '—' },
    { icon: Building2, label: 'Client / Unit', value: [employee.client_name, employee.unit_name].filter(Boolean).join(' / ') || '—' },
    { icon: Mail, label: 'Email', value: employee.email || '—' },
    { icon: Phone, label: 'Mobile', value: employee.mobile_number ? `+91 ${employee.mobile_number}` : '—' },
    { icon: MapPin, label: 'City', value: employee.city || '—' },
    { icon: CalendarDays, label: 'Date of Joining', value: employee.date_of_joining ? formatDate(employee.date_of_joining) : '—' },
    { icon: Shield, label: 'Role', value: roleBadge.label },
  ];

  return (
    <div className="space-y-5">
      {/* Profile Card */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-emerald-600 to-emerald-500" />
        <CardContent className="p-5 -mt-10">
          <div className="flex items-end gap-4">
            <Avatar className="w-20 h-20 border-4 border-white shadow-md">
              <AvatarImage src={getFileUrl(employee.profile_pic_url) || undefined} alt={employee.full_name} />
              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="pb-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">{employee.full_name}</h2>
              <p className="text-sm text-gray-500">{employee.designation || 'Employee'}</p>
              <Badge variant="outline" className={`mt-1 text-xs ${roleBadge.className}`}>
                {roleBadge.label}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Details */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="space-y-1">
            {profileFields.map((field) => (
              <div key={field.label} className="flex items-start gap-3 py-2.5">
                <field.icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">{field.label}</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{field.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="w-full" onClick={() => onNavigate('settings')}>
          <Settings className="w-4 h-4" />
          Settings
        </Button>
        <Button variant="outline" className="w-full" onClick={() => onNavigate('leaves')}>
          <Leaf className="w-4 h-4" />
          Leave Balance
        </Button>
      </div>
    </div>
  );
}
