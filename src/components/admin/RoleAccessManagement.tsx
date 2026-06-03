'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Shield,
  Building2,
  MapPin,
  Users,
  Navigation,
  Save,
  RotateCcw,
  Loader2,
  Eye,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoleAccessEntry {
  id?: number;
  role: string;
  canViewSites: boolean;
  canViewUnits: boolean;
  canViewEmployees: boolean;
  canViewLocations: boolean;
}

interface RoleDefinition {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultAccess: RoleAccessEntry;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'employee',
    label: 'Employee (HK Worker, HK Lady)',
    description: 'Frontline housekeeping staff',
    icon: <Users className="w-4 h-4 text-muted-foreground" />,
    defaultAccess: {
      role: 'employee',
      canViewSites: false,
      canViewUnits: false,
      canViewEmployees: false,
      canViewLocations: false,
    },
  },
  {
    key: 'supervisor',
    label: 'Supervisor',
    description: 'On-site shift supervisors',
    icon: <Eye className="w-4 h-4 text-muted-foreground" />,
    defaultAccess: {
      role: 'supervisor',
      canViewSites: true,
      canViewUnits: true,
      canViewEmployees: false,
      canViewLocations: true,
    },
  },
  {
    key: 'field_officer',
    label: 'Field Officer',
    description: 'Field operations officers',
    icon: <Navigation className="w-4 h-4 text-muted-foreground" />,
    defaultAccess: {
      role: 'field_officer',
      canViewSites: true,
      canViewUnits: true,
      canViewEmployees: true,
      canViewLocations: true,
    },
  },
  {
    key: 'manager',
    label: 'Manager',
    description: 'Operations & project managers',
    icon: <Building2 className="w-4 h-4 text-muted-foreground" />,
    defaultAccess: {
      role: 'manager',
      canViewSites: true,
      canViewUnits: true,
      canViewEmployees: true,
      canViewLocations: true,
    },
  },
  {
    key: 'regional_manager',
    label: 'Regional Manager',
    description: 'Regional oversight managers',
    icon: <MapPin className="w-4 h-4 text-muted-foreground" />,
    defaultAccess: {
      role: 'regional_manager',
      canViewSites: true,
      canViewUnits: true,
      canViewEmployees: true,
      canViewLocations: true,
    },
  },
  {
    key: 'admin',
    label: 'Admin',
    description: 'System administrators',
    icon: <Shield className="w-4 h-4 text-muted-foreground" />,
    defaultAccess: {
      role: 'admin',
      canViewSites: true,
      canViewUnits: true,
      canViewEmployees: true,
      canViewLocations: true,
    },
  },
];

const PERMISSION_COLUMNS = [
  {
    key: 'canViewSites' as keyof RoleAccessEntry,
    label: 'Can View Sites',
    description: 'Client list & site details',
    icon: <Building2 className="w-3.5 h-3.5" />,
  },
  {
    key: 'canViewUnits' as keyof RoleAccessEntry,
    label: 'Can View Units',
    description: 'Unit / location list',
    icon: <MapPin className="w-3.5 h-3.5" />,
  },
  {
    key: 'canViewEmployees' as keyof RoleAccessEntry,
    label: 'Can View Employees',
    description: 'Employee directory',
    icon: <Users className="w-3.5 h-3.5" />,
  },
  {
    key: 'canViewLocations' as keyof RoleAccessEntry,
    label: 'Can View Location Data',
    description: 'GPS, addresses',
    icon: <Navigation className="w-3.5 h-3.5" />,
  },
] as const;

const STORAGE_KEY = 'rcs_role_access_settings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadFromLocalStorage(): RoleAccessEntry[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length === ROLE_DEFINITIONS.length) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveToLocalStorage(data: RoleAccessEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function getDefaultRoles(): RoleAccessEntry[] {
  return ROLE_DEFINITIONS.map((r) => ({ ...r.defaultAccess }));
}

// ─── Summary Helpers ─────────────────────────────────────────────────────────

function getPermissionSummary(roles: RoleAccessEntry[]) {
  const total = roles.length;
  const summary = PERMISSION_COLUMNS.map((col) => {
    const count = roles.filter((r) => r[col.key] === true).length;
    return { ...col, count, percentage: Math.round((count / total) * 100) };
  });
  return summary;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoleAccessManagement() {
  const [roleAccess, setRoleAccess] = useState<RoleAccessEntry[]>(getDefaultRoles);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize: try API first, fall back to localStorage, then defaults
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/role-access');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setRoleAccess(data);
            saveToLocalStorage(data);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // API not available; fall back to local storage
      }

      const localData = loadFromLocalStorage();
      if (localData) {
        setRoleAccess(localData);
      }
      setIsLoading(false);
    }
    init();
  }, []);

  // Detect changes
  const originalRef = useRef<RoleAccessEntry[] | null>(null);
  useEffect(() => {
    if (!isLoading && !originalRef.current) {
      originalRef.current = [...roleAccess];
    }
  }, [isLoading, roleAccess]);

  useEffect(() => {
    if (originalRef.current && roleAccess.length === originalRef.current.length) {
      const changed = roleAccess.some((r, i) => {
        const o = originalRef.current![i];
        return (
          r.canViewSites !== o.canViewSites ||
          r.canViewUnits !== o.canViewUnits ||
          r.canViewEmployees !== o.canViewEmployees ||
          r.canViewLocations !== o.canViewLocations
        );
      });
      setHasChanges(changed);
    }
  }, [roleAccess]);

  const togglePermission = useCallback(
    (roleKey: string, permissionKey: keyof RoleAccessEntry) => {
      setRoleAccess((prev) =>
        prev.map((r) =>
          r.role === roleKey
            ? { ...r, [permissionKey]: !r[permissionKey] }
            : r
        )
      );
    },
    []
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/role-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: roleAccess }),
      });

      if (res.ok) {
        const data = await res.json();
        setRoleAccess(data);
        originalRef.current = [...data];
        saveToLocalStorage(data);
        setHasChanges(false);
        toast.success('Role access settings saved successfully');
      } else {
        // API failed — save to localStorage as fallback
        saveToLocalStorage(roleAccess);
        originalRef.current = [...roleAccess];
        setHasChanges(false);
        toast.success('Settings saved locally (API unavailable)');
      }
    } catch {
      // Network error — save locally
      saveToLocalStorage(roleAccess);
      originalRef.current = [...roleAccess];
      setHasChanges(false);
      toast.success('Settings saved locally (offline mode)');
    } finally {
      setIsSaving(false);
    }
  }, [roleAccess]);

  const handleReset = useCallback(() => {
    const defaults = getDefaultRoles();
    setRoleAccess(defaults);
    originalRef.current = [...defaults];
    saveToLocalStorage(defaults);
    setHasChanges(false);
    toast.info('Reset to default access settings');
  }, []);

  const summary = getPermissionSummary(roleAccess);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading access settings…
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header Card ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">Role Access Management</CardTitle>
              <CardDescription>
                Configure which designations can view which data in the ESS mobile
                app. Changes take effect on next app refresh.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Settings
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isSaving}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Defaults
            </Button>
            {hasChanges && (
              <Badge variant="secondary" className="gap-1">
                <Info className="w-3 h-3" />
                Unsaved changes
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Permission Summary Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summary.map((col) => (
          <Card key={String(col.key)} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {col.icon}
                <span className="truncate">{col.label.replace('Can View ', '')}</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-bold">{col.count}</span>
                <span className="text-sm text-muted-foreground">/ {roleAccess.length}</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${col.percentage}%` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Access Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Access Configuration</CardTitle>
          <CardDescription>
            Toggle checkboxes to grant or revoke data visibility for each role.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Role / Designation</TableHead>
                  {PERMISSION_COLUMNS.map((col) => (
                    <TableHead key={String(col.key)} className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center gap-1 text-xs">
                          {col.icon}
                          {col.label.replace('Can View ', '')}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {col.description}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center">Access Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roleAccess.map((entry) => {
                  const roleDef = ROLE_DEFINITIONS.find(
                    (r) => r.key === entry.role
                  );
                  const enabledCount = PERMISSION_COLUMNS.filter(
                    (col) => entry[col.key] === true
                  ).length;

                  return (
                    <TableRow key={entry.role}>
                      {/* Role Name */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                            {roleDef?.icon}
                          </div>
                          <div>
                            <div className="font-medium">{roleDef?.label ?? entry.role}</div>
                            <div className="text-xs text-muted-foreground">
                              {roleDef?.description ?? ''}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Permission Checkboxes */}
                      {PERMISSION_COLUMNS.map((col) => (
                        <TableCell key={String(col.key)} className="text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={entry[col.key] === true}
                              onCheckedChange={() =>
                                togglePermission(entry.role, col.key)
                              }
                              aria-label={`${roleDef?.label} — ${col.label}`}
                            />
                          </div>
                        </TableCell>
                      ))}

                      {/* Access Level Badge */}
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            enabledCount === PERMISSION_COLUMNS.length
                              ? 'default'
                              : enabledCount > 0
                              ? 'secondary'
                              : 'outline'
                          }
                          className="gap-1"
                        >
                          {enabledCount === PERMISSION_COLUMNS.length ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : enabledCount === 0 ? (
                            <XCircle className="w-3 h-3" />
                          ) : null}
                          {enabledCount === PERMISSION_COLUMNS.length
                            ? 'Full'
                            : enabledCount === 0
                            ? 'None'
                            : `${enabledCount}/${PERMISSION_COLUMNS.length}`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Quick-reference Summary ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Current Access Summary</CardTitle>
          <CardDescription>
            At a glance: which roles can access which modules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ROLE_DEFINITIONS.map((roleDef, idx) => {
            const entry = roleAccess.find((r) => r.role === roleDef.key);
            if (!entry) return null;

            const granted: string[] = [];
            const denied: string[] = [];

            PERMISSION_COLUMNS.forEach((col) => {
              const shortLabel = col.label.replace('Can View ', '');
              if (entry[col.key] === true) {
                granted.push(shortLabel);
              } else {
                denied.push(shortLabel);
              }
            });

            return (
              <div key={roleDef.key}>
                {idx > 0 && <Separator className="mb-4" />}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    {roleDef.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{roleDef.label}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {granted.map((g) => (
                        <Badge
                          key={g}
                          variant="default"
                          className="gap-1 text-[11px]"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {g}
                        </Badge>
                      ))}
                      {denied.map((d) => (
                        <Badge
                          key={d}
                          variant="outline"
                          className="gap-1 text-[11px]"
                        >
                          <XCircle className="w-3 h-3" />
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
