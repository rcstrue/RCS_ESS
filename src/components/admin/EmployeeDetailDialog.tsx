import { useState, useEffect, useCallback, memo } from 'react';
import { getClientsWithUnits } from '@/lib/api/clients';
import { updateEmployee, Employee } from '@/lib/api/employees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Loader2, User, CreditCard, MapPin, Building2, Save, X, FileText, Users, Phone, Calendar, Upload } from 'lucide-react';
import { DocumentViewerDialog } from './DocumentViewerDialog';
import { getFileUrl } from '@/lib/api/config';

interface Client {
  id: number;
  name: string;
  units: { id: number; name: string }[];
}

interface EmployeeDetailDialogProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  userRole: string;
}

// Move InputField outside to prevent re-renders
const InputField = memo(({ 
  label, 
  value, 
  onChange, 
  disabled, 
  type = 'text', 
  placeholder 
}: { 
  label: string; 
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: string;
  placeholder?: string;
}) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <Input
      type={type}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="h-8 text-sm"
    />
  </div>
));
InputField.displayName = 'InputField';

// Display field helper (read-only)
const DisplayField = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div>
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <div className="text-sm font-medium mt-1">{value || '-'}</div>
  </div>
);

export function EmployeeDetailDialog({
  employee,
  isOpen,
  onClose,
  onSave,
  userRole,
}: EmployeeDetailDialogProps) {
  const [formData, setFormData] = useState<Partial<Employee>>({});
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ 
    url: string; 
    title: string; 
    documentType?: 'aadhaar_front' | 'aadhaar_back' | 'bank_document' | 'profile_pic';
  } | null>(null);
  const isAdmin = userRole === 'admin';
  const canEdit = userRole === 'admin' || userRole === 'manager';

  useEffect(() => {
    if (employee) {
      setFormData(employee);
    }
  }, [employee]);

  useEffect(() => {
    if (isOpen) {
      fetchClients();
    }
  }, [isOpen]);

  const fetchClients = async () => {
    setIsLoading(true);
    const { data } = await getClientsWithUnits();
    if (data) {
      setClients(data);
    }
    setIsLoading(false);
  };

  const handleChange = useCallback((field: keyof Employee, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleClientChange = useCallback((clientId: string) => {
    const client = clients.find(c => c.id === parseInt(clientId));
    setFormData(prev => ({
      ...prev,
      client_id: clientId,
      client_name: client?.name || null,
      unit_id: null,
      unit_name: null,
    }));
  }, [clients]);

  const handleUnitChange = useCallback((unitId: string) => {
    const client = clients.find(c => c.id === parseInt(formData.client_id || '0'));
    const unit = client?.units.find(u => u.id === parseInt(unitId));
    setFormData(prev => ({
      ...prev,
      unit_id: unitId,
      unit_name: unit?.name || null,
    }));
  }, [clients, formData.client_id]);

  const handleDocumentUpdated = (newUrl: string) => {
    if (viewerImage?.documentType) {
      const fieldMap: Record<string, keyof Employee> = {
        'aadhaar_front': 'aadhaar_front_url',
        'aadhaar_back': 'aadhaar_back_url',
        'bank_document': 'bank_document_url',
        'profile_pic': 'profile_pic_url',
      };
      const field = fieldMap[viewerImage.documentType];
      if (field) {
        setFormData(prev => ({ ...prev, [field]: newUrl }));
      }
    }
    setViewerImage(prev => prev ? { ...prev, url: newUrl } : null);
  };

  const handleSave = async () => {
    if (!employee) return;

    setIsSaving(true);
    
    const updateData: Record<string, unknown> = {};
    
    if (isAdmin) {
      const editableFields: (keyof Employee)[] = [
        'full_name', 'father_name', 'mobile_number', 'alternate_mobile', 'email', 'date_of_birth', 'gender',
        'marital_status', 'blood_group', 'aadhaar_number', 'address', 'pin_code', 'district',
        'state', 'bank_name', 'account_number', 'ifsc_code', 'account_holder_name',
        'client_id', 'client_name', 'unit_id', 'unit_name', 'uan_number', 'esic_number',
        'emergency_contact_name', 'emergency_contact_relation',
        'designation', 'department', 'employment_type', 'worker_category', 'date_of_joining',
        'confirmation_date', 'probation_period', 'date_of_leaving',
        'nominee_name', 'nominee_relationship', 'nominee_dob', 'nominee_contact'
      ];
      
      editableFields.forEach(key => {
        if (formData[key] !== employee[key]) {
          updateData[key] = formData[key];
        }
      });
    } else {
      if (formData.client_id !== employee.client_id) {
        updateData.client_id = formData.client_id;
        updateData.client_name = formData.client_name;
      }
      if (formData.unit_id !== employee.unit_id) {
        updateData.unit_id = formData.unit_id;
        updateData.unit_name = formData.unit_name;
      }
      if (Object.keys(updateData).length > 0) {
        updateData.manager_edits_pending = true;
      }
    }

    if (Object.keys(updateData).length === 0) {
      toast.info('No changes to save');
      setIsSaving(false);
      return;
    }

    const { error } = await updateEmployee(employee.id, updateData);

    if (error) {
      toast.error('Failed to save changes');
    } else {
      toast.success(isAdmin ? 'Employee updated successfully' : 'Changes submitted for admin approval');
      onSave();
      onClose();
    }
    setIsSaving(false);
  };

  const selectedClient = clients.find(c => c.id === parseInt(formData.client_id || '0'));
  const profilePic = formData.profile_pic_cropped_url || formData.profile_pic_url;

  // Document rendering helper - with upload capability for empty slots
  const renderDocument = (label: string, url: string | null | undefined, documentType: 'aadhaar_front' | 'aadhaar_back' | 'bank_document' | 'profile_pic') => {
    const fullUrl = getFileUrl(url);
    return (
      <div className="space-y-1">
        <Label className="text-xs">{label}</Label>
        {fullUrl ? (
          <div className="relative group border rounded-lg overflow-hidden bg-muted">
            <img
              src={fullUrl}
              alt={label}
              className="w-full h-24 object-cover cursor-pointer"
              onClick={() => setViewerImage({ url: fullUrl, title: label, documentType })}
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button 
                size="sm" 
                variant="secondary"
                onClick={() => setViewerImage({ url: fullUrl, title: label, documentType })}
              >
                View
              </Button>
            </div>
          </div>
        ) : (
          <div 
            className="h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground text-xs cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setViewerImage({ url: '', title: label, documentType })}
          >
            <Upload className="w-5 h-5 mb-1" />
            <span>Click to upload</span>
          </div>
        )}
      </div>
    );
  };

  if (!employee) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[100vw] w-screen h-screen max-h-screen p-0 rounded-none">
        <DialogHeader className="p-3 border-b bg-muted/30">
          <div className="flex items-center gap-4">
            <Avatar className="w-12 h-12">
              <AvatarImage src={getFileUrl(profilePic) || undefined} />
              <AvatarFallback>
                <User className="w-6 h-6" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <DialogTitle className="text-lg">
                {formData.full_name || 'Employee Details'}
              </DialogTitle>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-1">
                <span>Code: {formData.employee_code}</span>
                <span>•</span>
                <span>{formData.mobile_number}</span>
                <span>•</span>
                <span>{formData.email || 'No email'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                formData.status === 'approved' 
                  ? 'bg-green-100 text-green-700' 
                  : formData.status === 'pending_hr_verification'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {formData.status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'}
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="flex h-[calc(100vh-130px)]">
          {/* Left Side - All Fields */}
          <div className="flex-1 overflow-y-auto p-4 pb-20">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Personal Details */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-1">
                    <User className="w-4 h-4" />
                    Personal Details
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    <InputField label="Full Name" value={formData.full_name || ''} onChange={(v) => handleChange('full_name', v)} disabled={!isAdmin} />
                    <InputField label="Father/Husband Name" value={formData.father_name || ''} onChange={(v) => handleChange('father_name', v)} disabled={!isAdmin} />
                    <InputField label="Mobile Number" value={formData.mobile_number || ''} onChange={(v) => handleChange('mobile_number', v)} disabled={!isAdmin} />
                    <InputField label="Alternate Mobile" value={formData.alternate_mobile || ''} onChange={(v) => handleChange('alternate_mobile', v)} disabled={!isAdmin} />
                    <InputField label="Email" value={formData.email || ''} onChange={(v) => handleChange('email', v)} disabled={!isAdmin} />
                    <InputField label="Date of Birth" value={formData.date_of_birth || ''} onChange={(v) => handleChange('date_of_birth', v)} disabled={!isAdmin} type="date" />
                    <div>
                      <Label className="text-xs">Gender</Label>
                      <Select value={formData.gender || ''} onValueChange={(v) => handleChange('gender', v)} disabled={!isAdmin}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Marital Status</Label>
                      <Select value={formData.marital_status || ''} onValueChange={(v) => handleChange('marital_status', v)} disabled={!isAdmin}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single</SelectItem>
                          <SelectItem value="married">Married</SelectItem>
                          <SelectItem value="divorced">Divorced</SelectItem>
                          <SelectItem value="widowed">Widowed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <InputField label="Blood Group" value={formData.blood_group || ''} onChange={(v) => handleChange('blood_group', v)} disabled={!isAdmin} placeholder="e.g. B+" />
                    <InputField label="Aadhaar Number" value={formData.aadhaar_number || ''} onChange={(v) => handleChange('aadhaar_number', v)} disabled={!isAdmin} />
                    <InputField label="UAN Number" value={formData.uan_number || ''} onChange={(v) => handleChange('uan_number', v)} disabled={!isAdmin} />
                    <InputField label="ESIC Number" value={formData.esic_number || ''} onChange={(v) => handleChange('esic_number', v)} disabled={!isAdmin} />
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-1">
                    <MapPin className="w-4 h-4" />
                    Address
                  </h3>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-2">
                      <InputField label="Address" value={formData.address || ''} onChange={(v) => handleChange('address', v)} disabled={!isAdmin} />
                    </div>
                    <InputField label="PIN Code" value={formData.pin_code || ''} onChange={(v) => handleChange('pin_code', v)} disabled={!isAdmin} />
                    <InputField label="District" value={formData.district || ''} onChange={(v) => handleChange('district', v)} disabled={!isAdmin} />
                    <InputField label="State" value={formData.state || ''} onChange={(v) => handleChange('state', v)} disabled={!isAdmin} />
                  </div>
                </div>

                {/* Bank Details */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-1">
                    <CreditCard className="w-4 h-4" />
                    Bank Details
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    <InputField label="Bank Name" value={formData.bank_name || ''} onChange={(v) => handleChange('bank_name', v)} disabled={!isAdmin} />
                    <InputField label="Account Holder Name" value={formData.account_holder_name || ''} onChange={(v) => handleChange('account_holder_name', v)} disabled={!isAdmin} />
                    <InputField label="Account Number" value={formData.account_number || ''} onChange={(v) => handleChange('account_number', v)} disabled={!isAdmin} />
                    <InputField label="IFSC Code" value={formData.ifsc_code || ''} onChange={(v) => handleChange('ifsc_code', v)} disabled={!isAdmin} />
                  </div>
                </div>

                {/* Employment Details */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-1">
                    <Building2 className="w-4 h-4" />
                    Employment Details
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">Client</Label>
                      <Select value={formData.client_id || ''} onValueChange={handleClientChange} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select client" /></SelectTrigger>
                        <SelectContent>
                          {clients.map(client => (
                            <SelectItem key={client.id} value={client.id.toString()}>{client.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Unit / Location</Label>
                      <Select value={formData.unit_id || ''} onValueChange={handleUnitChange} disabled={!canEdit || !formData.client_id}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select unit" /></SelectTrigger>
                        <SelectContent>
                          {selectedClient?.units.map(unit => (
                            <SelectItem key={unit.id} value={unit.id.toString()}>{unit.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <InputField label="Designation" value={formData.designation || ''} onChange={(v) => handleChange('designation', v)} disabled={!isAdmin} />
                    <InputField label="Department" value={formData.department || ''} onChange={(v) => handleChange('department', v)} disabled={!isAdmin} />
                    <div>
                      <Label className="text-xs">Employment Type</Label>
                      <Select value={formData.employment_type || ''} onValueChange={(v) => handleChange('employment_type', v)} disabled={!isAdmin}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Permanent">Permanent</SelectItem>
                          <SelectItem value="Temporary">Temporary</SelectItem>
                          <SelectItem value="Contract">Contract</SelectItem>
                          <SelectItem value="Daily Wages">Daily Wages</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Worker Category</Label>
                      <Select value={formData.worker_category || ''} onValueChange={(v) => handleChange('worker_category', v)} disabled={!isAdmin}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Skilled">Skilled</SelectItem>
                          <SelectItem value="Semi-Skilled">Semi-Skilled</SelectItem>
                          <SelectItem value="Unskilled">Unskilled</SelectItem>
                          <SelectItem value="Supervisor">Supervisor</SelectItem>
                          <SelectItem value="Manager">Manager</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <InputField label="Date of Joining" value={formData.date_of_joining || ''} onChange={(v) => handleChange('date_of_joining', v)} disabled={!isAdmin} type="date" />
                    <InputField label="Confirmation Date" value={formData.confirmation_date || ''} onChange={(v) => handleChange('confirmation_date', v)} disabled={!isAdmin} type="date" />
                    <InputField label="Probation (Months)" value={formData.probation_period?.toString() || ''} onChange={(v) => handleChange('probation_period', v)} disabled={!isAdmin} type="number" />
                    <InputField label="Date of Leaving" value={formData.date_of_leaving || ''} onChange={(v) => handleChange('date_of_leaving', v)} disabled={!isAdmin} type="date" />
                  </div>
                </div>

                {/* Emergency & Nominee */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Emergency Contact */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-1">
                      <Phone className="w-4 h-4" />
                      Emergency Contact
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <InputField label="Contact Name" value={formData.emergency_contact_name || ''} onChange={(v) => handleChange('emergency_contact_name', v)} disabled={!isAdmin} />
                      <InputField label="Relation" value={formData.emergency_contact_relation || ''} onChange={(v) => handleChange('emergency_contact_relation', v)} disabled={!isAdmin} />
                    </div>
                  </div>

                  {/* Nominee Details */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-1">
                      <Users className="w-4 h-4" />
                      Nominee Details
                    </h3>
                    <div className="grid grid-cols-4 gap-3">
                      <InputField label="Name" value={formData.nominee_name || ''} onChange={(v) => handleChange('nominee_name', v)} disabled={!isAdmin} />
                      <InputField label="Relationship" value={formData.nominee_relationship || ''} onChange={(v) => handleChange('nominee_relationship', v)} disabled={!isAdmin} />
                      <InputField label="DOB" value={formData.nominee_dob || ''} onChange={(v) => handleChange('nominee_dob', v)} disabled={!isAdmin} type="date" />
                      <InputField label="Contact" value={formData.nominee_contact || ''} onChange={(v) => handleChange('nominee_contact', v)} disabled={!isAdmin} />
                    </div>
                  </div>
                </div>

                {/* Approval Info */}
                {formData.approved_at && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-1">
                      <Calendar className="w-4 h-4" />
                      Approval Information
                    </h3>
                    <div className="grid grid-cols-4 gap-3">
                      <DisplayField label="Approved At" value={formData.approved_at ? new Date(formData.approved_at).toLocaleString() : null} />
                      <DisplayField label="Approved By" value={formData.approved_by} />
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

          {/* Right Side - Documents */}
          <div className="w-64 border-l bg-muted/20 p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-primary mb-4">
              <FileText className="w-4 h-4" />
              Documents
            </h3>
            <div className="space-y-4">
              {renderDocument('Profile Photo', formData.profile_pic_url, 'profile_pic')}
              {renderDocument('Aadhaar Front', formData.aadhaar_front_url, 'aadhaar_front')}
              {renderDocument('Aadhaar Back', formData.aadhaar_back_url, 'aadhaar_back')}
              {renderDocument('Bank Document', formData.bank_document_url, 'bank_document')}
            </div>
          </div>
        </div>

        <DialogFooter className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <DocumentViewerDialog
        imageUrl={viewerImage?.url || null}
        title={viewerImage?.title || ''}
        isOpen={!!viewerImage}
        onClose={() => setViewerImage(null)}
        canUpload={isAdmin}
        employeeId={employee?.id?.toString()}
        documentType={viewerImage?.documentType}
        onDocumentUpdated={handleDocumentUpdated}
      />
    </Dialog>
  );
}
