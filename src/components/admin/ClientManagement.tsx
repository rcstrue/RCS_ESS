import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Building2 } from 'lucide-react';
import { 
  getClientsWithUnits, 
  createClient, 
  deleteClient, 
  createUnit, 
  deleteUnit,
  Client,
  Unit 
} from '@/lib/api/clients';

export function ClientManagement() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'client' | 'unit'; id: number; name: string } | null>(null);

  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await getClientsWithUnits();
    if (data) {
      setClients(data);
    } else if (error) {
      toast.error('Failed to load clients');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleAddClient = async () => {
    if (!newClientName.trim()) {
      toast.error('Client name is required');
      return;
    }

    setIsSaving(true);
    const { error } = await createClient(newClientName.trim());
    if (error) {
      toast.error('Failed to create client');
    } else {
      toast.success('Client created successfully');
      setNewClientName('');
      fetchClients();
    }
    setIsSaving(false);
  };

  const handleAddUnit = async () => {
    if (!selectedClientId) {
      toast.error('Please select a client');
      return;
    }
    if (!newUnitName.trim()) {
      toast.error('Unit name is required');
      return;
    }

    setIsSaving(true);
    const { error } = await createUnit(selectedClientId, newUnitName.trim());
    if (error) {
      toast.error('Failed to create unit');
    } else {
      toast.success('Unit created successfully');
      setNewUnitName('');
      fetchClients();
    }
    setIsSaving(false);
  };

  const handleDeleteClient = async () => {
    if (!deleteConfirm || deleteConfirm.type !== 'client') return;

    setIsSaving(true);
    const { error } = await deleteClient(deleteConfirm.id);
    if (error) {
      toast.error('Failed to delete client');
    } else {
      toast.success('Client deleted successfully');
      if (selectedClientId === deleteConfirm.id) {
        setSelectedClientId(null);
      }
      fetchClients();
    }
    setDeleteConfirm(null);
    setIsSaving(false);
  };

  const handleDeleteUnit = async () => {
    if (!deleteConfirm || deleteConfirm.type !== 'unit') return;

    setIsSaving(true);
    const { error } = await deleteUnit(deleteConfirm.id);
    if (error) {
      toast.error('Failed to delete unit');
    } else {
      toast.success('Unit deleted successfully');
      fetchClients();
    }
    setDeleteConfirm(null);
    setIsSaving(false);
  };

  const selectedClient = clients.find(c => c.id === selectedClientId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {/* Clients Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Clients
              <Badge variant="secondary" className="ml-2">{clients.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add Client Form */}
            <div className="flex gap-2">
              <Input
                placeholder="New client name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
              />
              <Button onClick={handleAddClient} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>

            {/* Clients List */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Units</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow 
                      key={client.id}
                      className={selectedClientId === client.id ? 'bg-muted' : ''}
                    >
                      <TableCell 
                        className="font-medium cursor-pointer"
                        onClick={() => setSelectedClientId(client.id)}
                      >
                        {client.name}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{client.units.length}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm({ type: 'client', id: client.id, name: client.name })}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {clients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No clients yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Units Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Units / Locations
              {selectedClient && (
                <Badge variant="outline" className="ml-2">
                  {selectedClient.name}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Client Selection */}
            <Select
              value={selectedClientId?.toString() || ''}
              onValueChange={(v) => setSelectedClientId(v ? Number(v) : null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a client first" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id.toString()}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Add Unit Form */}
            <div className="flex gap-2">
              <Input
                placeholder="New unit/location name"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUnit()}
                disabled={!selectedClientId}
              />
              <Button onClick={handleAddUnit} disabled={isSaving || !selectedClientId}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>

            {/* Units List */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedClient?.units.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">{unit.name}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm({ type: 'unit', id: unit.id, name: unit.name })}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!selectedClient || selectedClient.units.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                        {selectedClient ? 'No units for this client' : 'Select a client to view units'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteConfirm?.type === 'client' ? 'Client' : 'Unit'}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"?
              {deleteConfirm?.type === 'client' && ' This will also remove all associated units.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={deleteConfirm?.type === 'client' ? handleDeleteClient : handleDeleteUnit}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
