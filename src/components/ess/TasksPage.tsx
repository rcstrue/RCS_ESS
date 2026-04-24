import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Loader2,
  ListTodo,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Play,
  Check,
  CalendarDays,
  Users,
  CircleAlert,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchTasks,
  createTask,
  updateTask,
  fetchEmployees,
} from '@/lib/ess-api';
import type {
  Task,
  Employee,
  TASK_PRIORITIES as TaskPrioritiesType,
} from '@/lib/ess-types';
import { TASK_PRIORITIES } from '@/lib/ess-types';

interface TasksPageProps {
  employeeId: string | number;
  employeeName: string;
  role: string;
  canApprove: boolean;
}

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed';

const STATUS_FILTERS: { value: StatusFilter; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: <ListTodo className="h-3.5 w-3.5" /> },
  { value: 'pending', label: 'Pending', icon: <CircleAlert className="h-3.5 w-3.5" /> },
  { value: 'in_progress', label: 'In Progress', icon: <Play className="h-3.5 w-3.5" /> },
  { value: 'completed', label: 'Completed', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
];

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  in_progress: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function TasksPage({ employeeId, employeeName, role, canApprove }: TasksPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isUpdatingId, setIsUpdatingId] = useState<number | null>(null);

  // Create dialog
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPriority, setCreatePriority] = useState<string>('medium');
  const [createDeadline, setCreateDeadline] = useState('');
  const [createAssignedTo, setCreateAssignedTo] = useState<string>(String(employeeId));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Team employees (for assign-to dropdown)
  const [teamEmployees, setTeamEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);

  // ── Fetch tasks ──
  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await fetchTasks({
        assigned_to: canApprove ? undefined : employeeId,
        assigned_by: canApprove ? employeeId : undefined,
      });
      if (error) {
        toast.error('Failed to load tasks');
      } else {
        const allTasks = data?.items ?? [];
        // If canApprove, also fetch tasks assigned TO self
        if (canApprove) {
          const { data: selfData } = await fetchTasks({ assigned_to: employeeId });
          const selfTasks = selfData?.items ?? [];
          // Merge & deduplicate by id
          const merged = new Map<number, Task>();
          [...allTasks, ...selfTasks].forEach((t) => merged.set(t.id, t));
          setTasks(Array.from(merged.values()));
        } else {
          setTasks(allTasks);
        }
      }
    } catch {
      toast.error('Something went wrong while loading tasks');
    } finally {
      setIsLoading(false);
    }
  }, [employeeId, canApprove]);

  // ── Fetch team employees ──
  const loadTeamEmployees = useCallback(async () => {
    if (!canApprove) return;
    setIsLoadingEmployees(true);
    try {
      const { data } = await fetchEmployees({
        scope: 'team',
        requester_id: employeeId,
        limit: 100,
      });
      if (data?.items) {
        // Include self in the list for assignment
        const selfExists = data.items.some((e) => e.id === employeeId);
        if (!selfExists) {
          setTeamEmployees(data.items);
        } else {
          setTeamEmployees(data.items);
        }
      }
    } catch {
      // Silently fail – fallback to self only
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [employeeId, canApprove]);

  useEffect(() => {
    loadTasks();
    loadTeamEmployees();
  }, [loadTasks, loadTeamEmployees]);

  // ── Filter tasks ──
  const filteredTasks = statusFilter === 'all'
    ? tasks
    : tasks.filter((t) => t.status === statusFilter);

  // ── Create task ──
  const handleCreateTask = async () => {
    if (!createTitle.trim()) {
      toast.error('Please enter a task title');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Parameters<typeof createTask>[0] = {
        title: createTitle.trim(),
        description: createDescription.trim() || undefined,
        priority: createPriority as 'high' | 'medium' | 'low',
        deadline: createDeadline || undefined,
        assigned_to: Number(createAssignedTo),
      };
      const { error } = await createTask(payload);
      if (error) {
        toast.error('Failed to create task');
      } else {
        toast.success('Task created successfully');
        resetCreateForm();
        setIsCreateDialogOpen(false);
        loadTasks();
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setCreateTitle('');
    setCreateDescription('');
    setCreatePriority('medium');
    setCreateDeadline('');
    setCreateAssignedTo(String(employeeId));
  };

  // ── Update task status ──
  const handleStatusChange = async (task: Task, newStatus: Task['status']) => {
    setIsUpdatingId(task.id);
    try {
      const { error } = await updateTask(task.id, { status: newStatus });
      if (error) {
        toast.error('Failed to update task status');
      } else {
        const label =
          newStatus === 'in_progress' ? 'started' : 'completed';
        toast.success(`Task ${label} successfully`);
        loadTasks();
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsUpdatingId(null);
    }
  };

  // ── Helpers ──
  const isOverdue = (task: Task) =>
    task.deadline &&
    task.status !== 'completed' &&
    new Date(task.deadline) < new Date(new Date().toDateString());

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // ── Render ──

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Tasks</h2>
          <Badge variant="secondary" className="ml-1">
            {filteredTasks.length}
          </Badge>
        </div>
        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create Task</span>
        </Button>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {STATUS_FILTERS.map((filter) => {
          const count =
            filter.value === 'all'
              ? tasks.length
              : tasks.filter((t) => t.status === filter.value).length;
          return (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`
                inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium
                transition-colors border shrink-0
                ${
                  statusFilter === filter.value
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
                }
              `}
            >
              {filter.icon}
              {filter.label}
              <span
                className={`text-xs ${
                  statusFilter === filter.value
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          filter={statusFilter}
          onClearFilter={() => setStatusFilter('all')}
          onCreateClick={() => setIsCreateDialogOpen(true)}
        />
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="flex flex-col gap-3">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isUpdating={isUpdatingId === task.id}
                isOverdue={isOverdue(task)}
                formatDate={formatDate}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Create Task Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Task
            </DialogTitle>
            <DialogDescription>
              Add a new task for yourself
              {canApprove ? ' or a team member' : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="What needs to be done?"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                maxLength={200}
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Add more details about this task..."
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>

            {/* Priority + Deadline row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  Priority <span className="text-destructive">*</span>
                </label>
                <Select value={createPriority} onValueChange={setCreatePriority}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${
                              p.value === 'high'
                                ? 'bg-rose-500'
                                : p.value === 'medium'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                          />
                          {p.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                  Deadline
                </Label>
                <Input
                  type="date"
                  className="h-11"
                  value={createDeadline}
                  onChange={(e) => setCreateDeadline(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            {/* Assign To */}
            {canApprove ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Assign To</label>
                {isLoadingEmployees ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : teamEmployees.length > 0 ? (
                  <Select value={createAssignedTo} onValueChange={setCreateAssignedTo}>
                    <SelectTrigger>
                      <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Always include self first */}
                      <SelectItem value={String(employeeId)}>
                        {employeeName} (Self)
                      </SelectItem>
                      {teamEmployees
                        .filter((e) => e.id !== employeeId)
                        .map((emp) => (
                          <SelectItem key={emp.id} value={String(emp.id)}>
                            {emp.full_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {employeeName} (Self)
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Assigned To</label>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-md border bg-muted/50 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {employeeName} (Self)
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetCreateForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={isSubmitting || !createTitle.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Task'
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

interface TaskCardProps {
  task: Task;
  isUpdating: boolean;
  isOverdue: boolean;
  formatDate: (d?: string) => string | null;
  onStatusChange: (task: Task, status: Task['status']) => void;
}

function TaskCard({ task, isUpdating, isOverdue: overdue, formatDate, onStatusChange }: TaskCardProps) {
  const isCompleted = task.status === 'completed';

  return (
    <Card
      className={`transition-colors ${
        overdue
          ? 'border-2 border-destructive/60 bg-destructive/5 dark:bg-destructive/10'
          : 'border'
      } ${isCompleted ? 'opacity-75' : ''}`}
    >
      <CardContent className="p-4">
        {/* Top row: badges */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="outline" className={PRIORITY_BADGE[task.priority]}>
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </Badge>
          <Badge variant="outline" className={STATUS_BADGE[task.status]}>
            {STATUS_LABEL[task.status]}
          </Badge>
          {overdue && (
            <Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Overdue
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3
          className={`font-semibold text-base leading-snug mb-1 ${
            isCompleted ? 'line-through text-muted-foreground' : ''
          }`}
        >
          {task.title}
        </h3>

        {/* Description */}
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {task.description}
          </p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
          {task.assigned_to_name && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {task.assigned_to_name}
            </span>
          )}
          {task.deadline && (
            <span
              className={`inline-flex items-center gap-1 ${
                overdue ? 'text-destructive font-medium' : ''
              }`}
            >
              <CalendarDays className="h-3 w-3" />
              {formatDate(task.deadline)}
            </span>
          )}
        </div>

        {/* Action */}
        <div className="flex justify-end">
          {task.status === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              disabled={isUpdating}
              onClick={() => onStatusChange(task, 'in_progress')}
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Start
            </Button>
          )}
          {task.status === 'in_progress' && (
            <Button
              size="sm"
              disabled={isUpdating}
              onClick={() => onStatusChange(task, 'completed')}
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Complete
            </Button>
          )}
          {task.status === 'completed' && (
            <Badge
              variant="outline"
              className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 py-1 px-3"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Done
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  filter,
  onClearFilter,
  onCreateClick,
}: {
  filter: StatusFilter;
  onClearFilter: () => void;
  onCreateClick: () => void;
}) {
  const isFiltered = filter !== 'all';

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          {isFiltered ? (
            <Filter className="h-8 w-8 text-muted-foreground" />
          ) : (
            <ListTodo className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <h3 className="font-semibold text-lg mb-1">
          {isFiltered ? 'No tasks found' : 'No tasks yet'}
        </h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-xs">
          {isFiltered
            ? `There are no ${STATUS_LABEL[filter]?.toLowerCase() || ''} tasks right now.`
            : 'Create your first task to get started with task tracking.'}
        </p>
        <div className="flex gap-2">
          {isFiltered && (
            <Button variant="outline" size="sm" onClick={onClearFilter}>
              Clear Filter
            </Button>
          )}
          {!isFiltered && (
            <Button size="sm" onClick={onCreateClick}>
              <Plus className="h-4 w-4 mr-1" />
              Create Task
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Filter chips skeleton */}
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      {/* Card skeletons */}
      <div className="flex flex-col gap-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex gap-2 mb-3">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-2/3 mb-3" />
              <div className="flex justify-end">
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
