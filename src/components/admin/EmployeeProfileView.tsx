import { useState, useEffect } from 'react';
import { ArrowLeft, User, Phone, Mail, MapPin, Building, Calendar, FileText, Users, Loader2 } from 'lucide-react';

interface EmployeeProfileViewProps {
  employeeId: number;
  onBack: () => void;
}

const API_BASE = 'https://join.rcsfacility.com/api';

interface EmployeeDetails {
  id: number;
  name: string;
  phone: string;
  email: string;
  client_name: string;
  unit_name: string;
  designation: string;
  status: string;
  created_at: string;
  father_name?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  marital_status?: string;
  present_address?: string;
  permanent_address?: string;
  aadhar_number?: string;
  pan_number?: string;
  esic_number?: string;
  uan_number?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  nominee_name?: string;
  nominee_relation?: string;
  nominee_phone?: string;
  photo_url?: string;
  aadhar_photo_url?: string;
  pan_photo_url?: string;
}

export const EmployeeProfileView: React.FC<EmployeeProfileViewProps> = ({ employeeId, onBack }) => {
  const [employee, setEmployee] = useState<EmployeeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployeeDetails();
  }, [employeeId]);

  const fetchEmployeeDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/employee.php?id=${employeeId}`);
      const data = await response.json();
      
      if (data.success) {
        setEmployee(data.data);
      } else {
        setError(data.message || 'Failed to fetch employee details');
      }
    } catch (err) {
      console.error('Error fetching employee:', err);
      setError('Failed to load employee details');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading employee profile...</p>
        </div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Error Loading Profile</h2>
          <p className="text-gray-500 mb-6">{error || 'Employee not found'}</p>
          <button
            onClick={onBack}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-gray-800">Employee Profile</h1>
              <p className="text-sm text-gray-500">View only</p>
            </div>
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(employee.status)}`}>
              {employee.status || 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4 space-y-6 pb-8">
        {/* Profile Header Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
              {employee.photo_url ? (
                <img src={employee.photo_url} alt={employee.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-12 h-12 text-gray-400" />
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl font-bold text-gray-800 mb-1">{employee.name || 'N/A'}</h2>
              <p className="text-gray-600 mb-3">{employee.designation || 'No designation'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <Building className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{employee.client_name || 'No client'}</span>
                </div>
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{employee.unit_name || 'No unit'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Phone className="w-5 h-5 text-blue-600" />
            Contact Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">Phone Number</label>
              <p className="text-gray-800 font-medium">{employee.phone || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Email Address</label>
              <p className="text-gray-800 font-medium">{employee.email || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Personal Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            Personal Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">Father's Name</label>
              <p className="text-gray-800 font-medium">{employee.father_name || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Date of Birth</label>
              <p className="text-gray-800 font-medium">{formatDate(employee.date_of_birth || '')}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Gender</label>
              <p className="text-gray-800 font-medium capitalize">{employee.gender || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Blood Group</label>
              <p className="text-gray-800 font-medium">{employee.blood_group || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Marital Status</label>
              <p className="text-gray-800 font-medium capitalize">{employee.marital_status || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Address Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            Address Details
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-500">Present Address</label>
              <p className="text-gray-800 font-medium">{employee.present_address || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Permanent Address</label>
              <p className="text-gray-800 font-medium">{employee.permanent_address || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Document Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Document Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">Aadhar Number</label>
              <p className="text-gray-800 font-medium">{employee.aadhar_number || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">PAN Number</label>
              <p className="text-gray-800 font-medium">{employee.pan_number || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">ESIC Number</label>
              <p className="text-gray-800 font-medium">{employee.esic_number || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">UAN Number</label>
              <p className="text-gray-800 font-medium">{employee.uan_number || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Bank Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Building className="w-5 h-5 text-blue-600" />
            Bank Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">Bank Name</label>
              <p className="text-gray-800 font-medium">{employee.bank_name || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Account Number</label>
              <p className="text-gray-800 font-medium">{employee.account_number || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">IFSC Code</label>
              <p className="text-gray-800 font-medium">{employee.ifsc_code || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Nominee Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Nominee Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">Nominee Name</label>
              <p className="text-gray-800 font-medium">{employee.nominee_name || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Relation</label>
              <p className="text-gray-800 font-medium">{employee.nominee_relation || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Nominee Phone</label>
              <p className="text-gray-800 font-medium">{employee.nominee_phone || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Document Photos */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Document Photos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {employee.photo_url && (
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Profile Photo</label>
                <img src={employee.photo_url} alt="Profile" className="w-full h-32 object-cover rounded-lg border border-gray-200" />
              </div>
            )}
            {employee.aadhar_photo_url && (
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Aadhar Card</label>
                <img src={employee.aadhar_photo_url} alt="Aadhar" className="w-full h-32 object-cover rounded-lg border border-gray-200" />
              </div>
            )}
            {employee.pan_photo_url && (
              <div>
                <label className="text-sm text-gray-500 mb-2 block">PAN Card</label>
                <img src={employee.pan_photo_url} alt="PAN" className="w-full h-32 object-cover rounded-lg border border-gray-200" />
              </div>
            )}
          </div>
        </div>

        {/* Join Date */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-5 h-5 text-blue-600" />
            <span>Joined on {formatDate(employee.created_at || '')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfileView;
