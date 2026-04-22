import { useState, useEffect, useMemo } from 'react';
import { ArrowRight, ArrowLeft, Building, MapPin, Loader2, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClientUnitInfo } from '@/types/registration';
import { getClientsWithUnits } from '@/lib/api/clients';
import { getDesignations, Designation } from '@/lib/api/designations';

interface Unit {
  id: number | string;
  name: string;
  client_id: number | string;
}

interface Client {
  id: number | string;
  name: string;
  units: Unit[];
}

interface Step7Props {
  data: ClientUnitInfo;
  onUpdate: (data: Partial<ClientUnitInfo>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step7ClientUnit({
  data,
  onUpdate,
  onNext,
  onBack,
}: Step7Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<Client[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [clientsResult, designationsResult] = await Promise.all([
      getClientsWithUnits(),
      getDesignations()
    ]);
    
    console.log('Clients API response:', clientsResult);
    console.log('Designations API response:', designationsResult);
    
    if (clientsResult.data) {
      console.log('Clients data:', clientsResult.data);
      console.log('First client units:', clientsResult.data[0]?.units);
      setClients(clientsResult.data);
    }
    if (designationsResult.data) {
      // Filter only active designations (desi_view === 1 or "1")
      const active = designationsResult.data.filter(d => d.desi_view !== "0" && d.desi_view !== 0);
      setDesignations(active);
    }
    setIsLoading(false);
  };

  const selectedClient = useMemo(() => {
    return clients.find(client => String(client.id) === String(data.clientId));
  }, [data.clientId, clients]);

  const handleClientChange = (value: string) => {
    const client = clients.find(c => String(c.id) === value);
    const numericId = parseInt(value, 10);
    onUpdate({ 
      clientId: numericId, 
      clientName: client?.name || '',
      unitId: null, 
      unitName: '' 
    });
    setErrors(prev => ({ ...prev, clientName: '' }));
  };

  const handleUnitChange = (value: string) => {
    const unit = selectedClient?.units.find(u => String(u.id) === value);
    const numericId = parseInt(value, 10);
    onUpdate({ 
      unitId: numericId, 
      unitName: unit?.name || '' 
    });
    setErrors(prev => ({ ...prev, unitName: '' }));
  };

  const handleDesignationChange = (value: string) => {
    onUpdate({ designation: value });
    setErrors(prev => ({ ...prev, designation: '' }));
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};

    if (!data.clientId) {
      newErrors.clientName = 'Please select a client';
    }
    if (!data.unitId) {
      newErrors.unitName = 'Please select a unit/location';
    }
    if (!data.designation) {
      newErrors.designation = 'Please select a designation';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onNext();
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
    <div className="space-y-6 animate-slide-up">
      <div className="form-section">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Assignment Details
          </h2>
          <p className="text-sm text-muted-foreground">
            Select your assigned client, work location and designation
          </p>
        </div>

        {clients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No clients available. Please contact admin.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Client Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building className="w-4 h-4 text-muted-foreground" />
                Client Name <span className="text-destructive">*</span>
              </Label>
              <Select
                value={data.clientId ? String(data.clientId) : ''}
                onValueChange={handleClientChange}
              >
                <SelectTrigger className={errors.clientName ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select your client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={String(client.id)}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.clientName && (
                <p className="text-xs text-destructive">{errors.clientName}</p>
              )}
            </div>

            {/* Unit Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Unit / Site / Location <span className="text-destructive">*</span>
              </Label>
              <Select
                value={data.unitId ? String(data.unitId) : ''}
                onValueChange={handleUnitChange}
                disabled={!data.clientId}
              >
                <SelectTrigger className={errors.unitName ? 'border-destructive' : ''}>
                  <SelectValue placeholder={data.clientId ? 'Select unit/location' : 'First select a client'} />
                </SelectTrigger>
                <SelectContent>
                  {selectedClient?.units?.length > 0 ? (
                    selectedClient.units.map((unit) => (
                      <SelectItem key={unit.id} value={String(unit.id)}>
                        {unit.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="_none" disabled>
                      No units available for this client
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.unitName && (
                <p className="text-xs text-destructive">{errors.unitName}</p>
              )}
              {data.clientId && selectedClient?.units?.length === 0 && (
                <p className="text-xs text-warning">
                  No units found for {selectedClient?.name}. Contact admin to add units.
                </p>
              )}
            </div>

            {/* Designation Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-muted-foreground" />
                Designation <span className="text-destructive">*</span>
              </Label>
              <Select
                value={data.designation}
                onValueChange={handleDesignationChange}
              >
                <SelectTrigger className={errors.designation ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select your designation" />
                </SelectTrigger>
                <SelectContent>
                  {designations.map((designation) => (
                    <SelectItem key={designation.id} value={designation.name}>
                      {designation.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.designation && (
                <p className="text-xs text-destructive">{errors.designation}</p>
              )}
              {designations.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No designations available. Contact admin to add designations.
                </p>
              )}
            </div>

            {/* Selection Summary */}
            {data.clientName && data.unitName && data.designation && (
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                <h4 className="text-sm font-medium text-foreground mb-2">
                  Selected Assignment
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">Client:</span>
                    <span className="font-medium">{data.clientName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium">{data.unitName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">Designation:</span>
                    <span className="font-medium">{data.designation}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={handleSubmit} className="flex-1" disabled={clients.length === 0}>
          Review & Submit
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
