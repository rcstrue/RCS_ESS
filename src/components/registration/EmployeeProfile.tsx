import { useState } from 'react';
import { 
  User, Phone, Mail, Building, MapPin, CreditCard, 
  Edit2, LogOut, AlertCircle, Check, X, Save, Loader2,
  FileText, CreditCard as IdCard, Calendar, IndianRupee,
  FileQuestion, Bell, HelpCircle, ChevronDown, ChevronRight,
  FolderOpen, Eye, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProfileCompletion } from './ProfileCompletion';
import { IDCard } from './IDCard';
import { Employee, calculateProfileCompletion, getMissingFields } from '@/hooks/useEmployeeSession';
import { updateEmployee } from '@/lib/api/employees';
import { MARITAL_STATUS_OPTIONS } from '@/types/registration';
import { useToast } from '@/hooks/use-toast';
import { getFileUrl } from '@/lib/api/config';
import { toast } from 'sonner';
import { formatDateDDMMYYYY } from '@/lib/utils';

interface EmployeeProfileProps {
  employee: Employee;
  onLogout: () => void;
  onRefresh: () => Promise<void>;
  onStartRegistration: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  mobile_number: 'Mobile Number',
  date_of_birth: 'Date of Birth',
  full_name: 'Full Name',
  gender: 'Gender',
  aadhaar_number: 'Aadhaar Number',
  email: 'Email',
  uan_number: 'UAN Number',
  esic_number: 'ESIC Number',
  marital_status: 'Marital Status',
  address: 'Address',
  pin_code: 'PIN Code',
  state: 'State',
  district: 'District',
  bank_name: 'Bank Name',
  account_number: 'Account Number',
  ifsc_code: 'IFSC Code',
  account_holder_name: 'Account Holder Name',
  client_name: 'Client Name',
  unit_name: 'Unit/Location',
  profile_pic_url: 'Profile Photo',
  aadhaar_front_url: 'Aadhaar Front',
  aadhaar_back_url: 'Aadhaar Back',
  bank_document_url: 'Bank Document',
};

type MenuView = 'documents' | 'idcard' | 'attendance' | 'salary' | 'leave' | 'notifications' | 'help' | null;

export function EmployeeProfile({ employee, onLogout, onRefresh, onStartRegistration }: EmployeeProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editData, setEditData] = useState({
    email: employee.email || '',
    uan_number: employee.uan_number || '',
    esic_number: employee.esic_number || '',
    marital_status: employee.marital_status || '',
  });
  const [activeView, setActiveView] = useState<MenuView>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { toast: toastHook } = useToast();

  const profileCompletion = calculateProfileCompletion(employee);
  const missingFields = getMissingFields(employee);
  
  // Categorize missing fields
  const documentFields = missingFields.filter(f => f.includes('_url'));
  const personalFields = missingFields.filter(f => !f.includes('_url'));

  // Documents list
  const documents = [
    { key: 'profile_pic_url', label: 'Profile Photo', url: employee.profile_pic_url },
    { key: 'aadhaar_front_url', label: 'Aadhaar Card (Front)', url: employee.aadhaar_front_url },
    { key: 'aadhaar_back_url', label: 'Aadhaar Card (Back)', url: employee.aadhaar_back_url },
    { key: 'bank_document_url', label: 'Bank Document', url: employee.bank_document_url },
  ];

  const hasDocuments = documents.some(doc => doc.url);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await updateEmployee(employee.id, {
        email: editData.email || null,
        uan_number: editData.uan_number || null,
        esic_number: editData.esic_number || null,
        marital_status: editData.marital_status || null,
      });

      if (error) throw new Error(error);

      await onRefresh();
      setIsEditing(false);
      toastHook({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully.',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toastHook({
        title: 'Update Failed',
        description: 'Failed to update profile. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMenuClick = (view: MenuView) => {
    setActiveView(view);
  };

  const hasRequiredDocuments = !documentFields.length;
  const needsToCompleteRegistration = documentFields.length > 0 || personalFields.some(f => 
    ['full_name', 'date_of_birth', 'aadhaar_number', 'address', 'bank_name', 'account_number', 'client_name'].includes(f)
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header - compact */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b">
        <div className="max-w-2xl mx-auto px-3 py-2 flex items-center justify-between">
          <h1 className="text-sm font-semibold">My Profile</h1>
          <div className="flex items-center gap-3">
            <ProfileCompletion percentage={profileCompletion} />
            <Button variant="ghost" size="icon" onClick={onLogout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 pb-20 space-y-6">
        {/* Profile Header with Menu */}
        <div className="form-section">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-primary/20">
                {employee.profile_pic_url ? (
                  <img 
                    src={getFileUrl(employee.profile_pic_url) || undefined} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-primary" />
                )}
              </div>
              
              {/* Menu Button under profile image */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2 w-full text-xs gap-1"
                  >
                    Menu <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={() => handleMenuClick('documents')}>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Documents
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleMenuClick('idcard')}>
                    <IdCard className="w-4 h-4 mr-2" />
                    ID Card
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleMenuClick('attendance')}>
                    <Calendar className="w-4 h-4 mr-2" />
                    Attendance
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleMenuClick('salary')}>
                    <IndianRupee className="w-4 h-4 mr-2" />
                    Salary / Payslip
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleMenuClick('leave')}>
                    <FileQuestion className="w-4 h-4 mr-2" />
                    Leave Request
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleMenuClick('notifications')}>
                    <Bell className="w-4 h-4 mr-2" />
                    Notifications
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleMenuClick('help')}>
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Help / Support
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="flex-1">
              <h2 className="text-xl font-semibold">
                {employee.full_name || 'Complete Your Profile'}
              </h2>
              <p className="text-muted-foreground text-sm">+91 {employee.mobile_number}</p>
              <div className="mt-2">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                  employee.status === 'approved' || employee.status === 'verified'
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {employee.status === 'approved' || employee.status === 'verified' ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <AlertCircle className="w-3 h-3" />
                  )}
                  {employee.status === 'approved' || employee.status === 'verified' ? 'Verified' : 'Pending Verification'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Views */}
        {activeView && (
          <div className="form-section animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setActiveView(null)}
                className="gap-1"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                Back
              </Button>
            </div>
            
            {activeView === 'documents' && (
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <FolderOpen className="w-5 h-5 text-primary" />
                  My Documents
                </h3>
                {hasDocuments ? (
                  <div className="grid grid-cols-2 gap-3">
                    {documents.map((doc) => (
                      doc.url ? (
                        <div 
                          key={doc.key}
                          className="relative group rounded-lg overflow-hidden border border-border bg-muted cursor-pointer"
                          onClick={() => setSelectedImage(doc.url || null)}
                        >
                          <div className="aspect-[4/3]">
                            <img 
                              src={getFileUrl(doc.url) || undefined} 
                              alt={doc.label}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye className="w-6 h-6 text-white" />
                          </div>
                          <p className="text-xs text-center py-2 bg-background">{doc.label}</p>
                        </div>
                      ) : (
                        <div 
                          key={doc.key}
                          className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/50"
                        >
                          <div className="aspect-[4/3] flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">Not uploaded</span>
                          </div>
                          <p className="text-xs text-center py-2 bg-background">{doc.label}</p>
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No documents uploaded yet</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-3"
                      onClick={onStartRegistration}
                    >
                      Upload Documents
                    </Button>
                  </div>
                )}
              </div>
            )}
            
            {activeView === 'idcard' && (
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <IdCard className="w-5 h-5 text-primary" />
                  ID Card
                </h3>
                {employee.status === 'approved' || employee.status === 'verified' ? (
                  <IDCard employee={employee} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <IdCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>ID Card not available</p>
                    <p className="text-xs mt-2">Your profile needs to be verified first</p>
                  </div>
                )}
              </div>
            )}
            
            {activeView === 'attendance' && (
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-primary" />
                  Attendance
                </h3>
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Attendance feature coming soon</p>
                  <p className="text-xs mt-2">View your attendance records</p>
                </div>
              </div>
            )}
            
            {activeView === 'salary' && (
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <IndianRupee className="w-5 h-5 text-primary" />
                  Salary / Payslip
                </h3>
                <div className="text-center py-8 text-muted-foreground">
                  <IndianRupee className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Payslip feature coming soon</p>
                  <p className="text-xs mt-2">View and download your payslips</p>
                </div>
              </div>
            )}
            
            {activeView === 'leave' && (
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <FileQuestion className="w-5 h-5 text-primary" />
                  Leave Request
                </h3>
                <div className="text-center py-8 text-muted-foreground">
                  <FileQuestion className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Leave request feature coming soon</p>
                  <p className="text-xs mt-2">Apply and track your leave requests</p>
                </div>
              </div>
            )}
            
            {activeView === 'notifications' && (
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <Bell className="w-5 h-5 text-primary" />
                  Notifications
                </h3>
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No notifications</p>
                  <p className="text-xs mt-2">You're all caught up!</p>
                </div>
              </div>
            )}
            
            {activeView === 'help' && (
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <HelpCircle className="w-5 h-5 text-primary" />
                  Help / Support
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2">Contact HR</h4>
                    <p className="text-sm text-muted-foreground mb-2">For any queries, please contact:</p>
                    <p className="text-sm"><strong>Phone:</strong> +91 8469241414</p>
                    <p className="text-sm"><strong>Email:</strong> hr@rcsfacility.com</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2">Quick Help</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Profile completion is required for verification</li>
                      <li>• Upload clear photos of your documents</li>
                      <li>• Contact HR if you face any issues</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pending Data Alert */}
        {needsToCompleteRegistration && !activeView && (
          <div className="p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-orange-800 dark:text-orange-200">
                  Complete Your Registration
                </h3>
                <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                  Your profile is {profileCompletion}% complete. Complete the registration to enable all features.
                </p>
                {missingFields.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {missingFields.slice(0, 5).map(field => (
                      <span key={field} className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                        {FIELD_LABELS[field] || field}
                      </span>
                    ))}
                    {missingFields.length > 5 && (
                      <span className="text-xs text-orange-600 dark:text-orange-400">
                        +{missingFields.length - 5} more
                      </span>
                    )}
                  </div>
                )}
                <Button 
                  onClick={onStartRegistration} 
                  className="mt-3"
                  size="sm"
                >
                  Complete Registration
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Documents Preview - Always visible */}
        {!activeView && hasDocuments && (
          <div className="form-section">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-muted-foreground" />
                My Documents
              </h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setActiveView('documents')}
                className="text-xs"
              >
                View All <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {documents.filter(doc => doc.url).slice(0, 3).map((doc) => (
                <div 
                  key={doc.key}
                  className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted cursor-pointer"
                  onClick={() => setSelectedImage(doc.url || null)}
                >
                  <img 
                    src={getFileUrl(doc.url!) || undefined} 
                    alt={doc.label}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Editable Basic Info */}
        {!activeView && (
          <>
            <div className="form-section">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  Additional Information
                </h3>
                {!isEditing ? (
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={editData.email}
                      onChange={(e) => setEditData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Enter email address"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-uan">UAN Number</Label>
                    <Input
                      id="edit-uan"
                      value={editData.uan_number}
                      onChange={(e) => setEditData(prev => ({ ...prev, uan_number: e.target.value }))}
                      placeholder="Enter UAN number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-esic">ESIC Number</Label>
                    <Input
                      id="edit-esic"
                      value={editData.esic_number}
                      onChange={(e) => setEditData(prev => ({ ...prev, esic_number: e.target.value }))}
                      placeholder="Enter ESIC number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Marital Status</Label>
                    <Select
                      value={editData.marital_status}
                      onValueChange={(value) => setEditData(prev => ({ ...prev, marital_status: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select marital status" />
                      </SelectTrigger>
                      <SelectContent>
                        {MARITAL_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <InfoRow label="Email" value={employee.email} />
                  <InfoRow label="UAN Number" value={employee.uan_number} />
                  <InfoRow label="ESIC Number" value={employee.esic_number} />
                  <InfoRow 
                    label="Marital Status" 
                    value={employee.marital_status ? employee.marital_status.charAt(0).toUpperCase() + employee.marital_status.slice(1) : null} 
                  />
                </div>
              )}
            </div>

            {/* Personal Details - Read Only */}
            <div className="form-section">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-muted-foreground" />
                Personal Details
              </h3>
              <div className="space-y-3">
                <InfoRow label="Full Name" value={employee.full_name} />
                <InfoRow label="Date of Birth" value={employee.date_of_birth ? formatDateDDMMYYYY(employee.date_of_birth) : null} />
                <InfoRow label="Gender" value={employee.gender ? employee.gender.charAt(0).toUpperCase() + employee.gender.slice(1) : null} />
                <InfoRow label="Aadhaar Number" value={employee.aadhaar_number} masked />
              </div>
            </div>

            {/* Address */}
            <div className="form-section">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Address
              </h3>
              <div className="space-y-3">
                <InfoRow label="Address" value={employee.address} />
                <InfoRow label="PIN Code" value={employee.pin_code} />
                <InfoRow label="District" value={employee.district} />
                <InfoRow label="State" value={employee.state} />
              </div>
            </div>

            {/* Bank Details */}
            <div className="form-section">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                Bank Details
              </h3>
              <div className="space-y-3">
                <InfoRow label="Bank Name" value={employee.bank_name} />
                <InfoRow label="Account Number" value={employee.account_number} masked />
                <InfoRow label="IFSC Code" value={employee.ifsc_code} />
                <InfoRow label="Account Holder" value={employee.account_holder_name} />
              </div>
            </div>

            {/* Assignment */}
            <div className="form-section">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Building className="w-4 h-4 text-muted-foreground" />
                Assignment
              </h3>
              <div className="space-y-3">
                <InfoRow label="Client" value={employee.client_name} />
                <InfoRow label="Unit/Location" value={employee.unit_name} />
                {employee.designation && (
                  <InfoRow label="Designation" value={employee.designation} />
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Image Preview Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Document Preview</DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className="relative">
              <img 
                src={getFileUrl(selectedImage) || undefined} 
                alt="Document"
                className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
              />
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => {
                  const url = getFileUrl(selectedImage);
                  if (url) window.open(url, '_blank');
                }}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Open Full
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value, masked }: { label: string; value: string | null; masked?: boolean }) {
  const displayValue = value 
    ? (masked ? value.slice(0, 4) + ' **** ' + value.slice(-4) : value)
    : null;

  return (
    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {displayValue ? (
        <span className="text-sm font-medium">{displayValue}</span>
      ) : (
        <span className="text-xs text-orange-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Not provided
        </span>
      )}
    </div>
  );
}
