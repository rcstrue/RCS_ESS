import { useState, useEffect } from 'react';
import { Search, User, Phone, MapPin, Building, Calendar, Eye, X, ChevronDown, Loader2, AlertCircle } from 'lucide-react';

interface Employee {
  id: number;
  name: string;
  phone: string;
  email: string;
  client_name: string;
  unit_name: string;
  designation: string;
  status: string;
  created_at: string;
}

interface EmployeeManagementProps {
  onViewEmployee: (employeeId: number) => void;
}

const API_BASE = 'https://join.rcsfacility.com/api';

export const EmployeeManagement: React.FC<EmployeeManagementProps> = ({ onViewEmployee }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [clients, setClients] = useState<{ id: number; name: string }[]>([]);
  const [units, setUnits] = useState<{ id: number; name: string; client_id: number }[]>([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch all data in parallel
      const [empRes, clientRes, unitRes] = await Promise.all([
        fetch(`${API_BASE}/employees.php`),
        fetch(`${API_BASE}/clients.php`),
        fetch(`${API_BASE}/units.php`)
      ]);

      const empData = await empRes.json();
      const clientData = await clientRes.json();
      const unitData = await unitRes.json();

      console.log('Employees:', empData);
      console.log('Clients:', clientData);
      console.log('Units:', unitData);

      if (empData.success || empData.data) {
        setEmployees(empData.data || []);
      }
      
      if (clientData.success || clientData.data) {
        setClients(clientData.data || []);
      }
      
      if (unitData.success || unitData.data) {
        setUnits(unitData.data || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Get unique clients from employees if API doesn't work
  const uniqueClients = clients.length > 0 ? clients : 
    Array.from(new Set(employees.map(e => e.client_name).filter(Boolean))).map((name, i) => ({ id: i + 1, name }));

  // Get unique units from employees if API doesn't work
  const uniqueUnits = units.length > 0 ? units :
    Array.from(new Set(employees.map(e => e.unit_name).filter(Boolean))).map((name, i) => ({ id: i + 1, name, client_id: 0 }));

  // Filter units based on selected client
  const filteredUnits = clientFilter && units.length > 0
    ? units.filter(u => u.client_id === parseInt(clientFilter))
    : uniqueUnits;

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.phone?.includes(searchTerm) ||
      emp.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesClient = !clientFilter || emp.client_name === uniqueClients.find(c => c.id === parseInt(clientFilter))?.name;
    const matchesUnit = !unitFilter || emp.unit_name === uniqueUnits.find(u => u.id === parseInt(unitFilter))?.name;
    
    return matchesSearch && matchesClient && matchesUnit;
  });

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

  const selectedClientName = clientFilter ? uniqueClients.find(c => c.id === parseInt(clientFilter))?.name : '';
  const selectedUnitName = unitFilter ? uniqueUnits.find(u => u.id === parseInt(unitFilter))?.name : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Employee Management</h2>
          <p className="text-sm text-gray-500 mt-1">View employee records</p>
        </div>
        <div className="text-sm text-gray-500">
          Total: {filteredEmployees.length} employees
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-700">{error}</span>
          <button 
            onClick={fetchData}
            className="ml-auto px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, phone, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Client Filter */}
          <div className="relative flex-1">
            <button
              onClick={() => {
                setShowClientDropdown(!showClientDropdown);
                setShowUnitDropdown(false);
              }}
              className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
            >
              <span className={clientFilter ? 'text-gray-800' : 'text-gray-500'}>
                {clientFilter ? selectedClientName : 'All Clients'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showClientDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                <button
                  onClick={() => {
                    setClientFilter('');
                    setUnitFilter('');
                    setShowClientDropdown(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 text-gray-600"
                >
                  All Clients
                </button>
                {uniqueClients.map(client => (
                  <button
                    key={client.id}
                    onClick={() => {
                      setClientFilter(client.id.toString());
                      setUnitFilter('');
                      setShowClientDropdown(false);
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50"
                  >
                    {client.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Unit Filter */}
          <div className="relative flex-1">
            <button
              onClick={() => {
                setShowUnitDropdown(!showUnitDropdown);
                setShowClientDropdown(false);
              }}
              className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
            >
              <span className={unitFilter ? 'text-gray-800' : 'text-gray-500'}>
                {unitFilter ? selectedUnitName : 'All Units'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showUnitDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                <button
                  onClick={() => {
                    setUnitFilter('');
                    setShowUnitDropdown(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 text-gray-600"
                >
                  All Units
                </button>
                {filteredUnits.map(unit => (
                  <button
                    key={unit.id}
                    onClick={() => {
                      setUnitFilter(unit.id.toString());
                      setShowUnitDropdown(false);
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50"
                  >
                    {unit.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clear Filters */}
          {(clientFilter || unitFilter || searchTerm) && (
            <button
              onClick={() => {
                setClientFilter('');
                setUnitFilter('');
                setSearchTerm('');
              }}
              className="flex items-center gap-2 px-4 py-3 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Employee List */}
      {filteredEmployees.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">No employees found</h3>
          <p className="text-gray-500">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEmployees.map(employee => (
            <div
              key={employee.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Employee Name & Status */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-800 truncate">
                      {employee.name || 'N/A'}
                    </h3>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(employee.status)}`}>
                      {employee.status || 'Unknown'}
                    </span>
                  </div>

                  {/* Info Grid - Mobile Friendly */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>{employee.phone || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Building className="w-4 h-4 text-gray-400" />
                      <span>{employee.client_name || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span>{employee.unit_name || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span>Joined: {formatDate(employee.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* View Button */}
                <button
                  onClick={() => onViewEmployee(employee.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0"
                >
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">View</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmployeeManagement;
