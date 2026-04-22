import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Edit2, Briefcase } from 'lucide-react';
import { 
  getDesignations, 
  createDesignation, 
  updateDesignation, 
  deleteDesignation,
  Designation 
} from '@/lib/api/designations';

export function DesignationManagement() {
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDesignation, setEditingDesignation] = useState<Designation | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesiView, setNewDesiView] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<Designation | null>(null);

  const fetchDesignations = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await getDesignations();
    if (data) {
      setDesignations(data);
    } else if (error) {
      toast.error('Failed to load designations');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchDesignations();
  }, [fetchDesignations]);

  const handleOpenDialog = (designation?: Designation) => {
    if (designation) {
      setEditingDesignation(designation);
      setNewName(designation.name);
      setNewDesiView(designation.desi_view ?? 1);
    } else {
      setEditingDesignation(null);
      setNewName('');
      setNewDesiView(1);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingDesignation(null);
    setNewName('');
    setNewDesiView(1);
  };

  const handleSave = async () => {
    if (!newName.trim()) {
      toast.error('Designation name is required');
      return;
    }

    setIsSaving(true);

    if (editingDesignation) {
      const { error } = await updateDesignation(editingDesignation.id, {
        name: newName.trim(),
        desi_view: newDesiView
      });
      if (error) {
        toast.error('Failed to update designation');
      } else {
        toast.success('Designation updated');
        fetchDesignations();
        handleCloseDialog();
      }
    } else {
      const { error } = await createDesignation(newName.trim(), newDesiView);
      if (error) {
        toast.error('Failed to create designation');
      } else {
        toast.success('Designation created');
        fetchDesignations();
        handleCloseDialog();
      }
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setIsSaving(true);
    const { error } = await deleteDesignation(deleteConfirm.id);
    if (error) {
      toast.error('Failed to delete designation');
    } else {
      toast.success('Designation deleted');
      fetchDesignations();
    }
    setDeleteConfirm(null);
    setIsSaving(false);
  };

  const handleToggleView = async (designation: Designation) => {
    const newValue = (designation.desi_view ?? 1) === 1 ? 0 : 1;
    const { error, data } = await updateDesignation(designation.id, { desi_view: newValue });
    if (error) {
      toast.error('Failed to update: ' + error);
      // Revert optimistic update by refreshing
      fetchDesignations();
    } else {
      // Update with server response
      if (data) {
        setDesignations(prev => 
          prev.map(d => d.id === designation.id ? { ...d, desi_view: data.desi_view } : d)
        );
        toast.success(data.desi_view === 1 ? 'Now visible in registration' : 'Hidden from registration');
      } else {
        // Refresh if no data returned
        fetchDesignations();
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Designation Management
              <Badge variant="secondary" className="ml-2">{designations.length}</Badge>
            </div>
            <Button onClick={() => handleOpenDialog()} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add Designation
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Designation Name</TableHead>
                  <TableHead className="text-center w-40">Show in Registration</TableHead>
                  <TableHead className="text-right w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {designations.map((designation, index) => (
                  <TableRow key={designation.id}>
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium">{designation.name}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Switch
                          checked={(designation.desi_view ?? 1) === 1}
                          onCheckedChange={() => handleToggleView(designation)}
                        />
                        <span className={`text-xs font-medium ${
                          (designation.desi_view ?? 1) === 1 
                            ? 'text-green-600' 
                            : 'text-muted-foreground'
                        }`}>
                          {(designation.desi_view ?? 1) === 1 ? 'Visible' : 'Hidden'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(designation)}
                          className="h-8 w-8"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(designation)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {designations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                      <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No designations found</p>
                      <p className="text-sm mb-4">Add designations to assign to employees</p>
                      <Button 
                        variant="outline" 
                        onClick={() => handleOpenDialog()}
                        className="mt-2"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add your first designation
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Show in Registration</strong>: When enabled, the designation will appear in the dropdown 
              during employee registration. Disable to hide it from the list.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDesignation ? 'Edit Designation' : 'Add Designation'}
            </DialogTitle>
            <DialogDescription>
              {editingDesignation 
                ? 'Update the designation name and visibility settings.'
                : 'Create a new designation for employee assignments.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Designation Name *</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Security Guard"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <label className="text-sm font-medium">Show in Registration</label>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, this designation will appear in the employee registration form
                </p>
              </div>
              <Switch
                checked={newDesiView === 1}
                onCheckedChange={(checked) => setNewDesiView(checked ? 1 : 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingDesignation ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Designation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
