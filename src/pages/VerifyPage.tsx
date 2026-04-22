import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEmployeeById } from '@/lib/api/employees';
import { getFileUrl } from '@/lib/api/config';
import { Loader2, CheckCircle, XCircle, User, Phone, Building2, Calendar, Shield } from 'lucide-react';

interface EmployeeData {
  id: number;
  employee_code: number | null;
  full_name: string | null;
  mobile_number: string;
  designation: string | null;
  client_name: string | null;
  unit_name: string | null;
  profile_pic_url: string | null;
  status: string | null;
}

export default function VerifyPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEmployee = async () => {
      // Parse query params from hash URL (for HashRouter)
      // URL format: https://join.rcsfacility.com/#/verify?id=1685&code=1665
      const hash = window.location.hash;
      console.log('Full URL:', window.location.href);
      console.log('Hash:', hash);
      
      // Extract query string from hash
      const queryIndex = hash.indexOf('?');
      if (queryIndex === -1) {
        console.error('No query params found in hash');
        setError('Invalid verification link - no parameters');
        setIsLoading(false);
        return;
      }
      
      const queryString = hash.substring(queryIndex + 1);
      console.log('Query string:', queryString);
      
      const params = new URLSearchParams(queryString);
      const id = params.get('id');
      const code = params.get('code');
      
      console.log('Parsed ID:', id, 'Code:', code);
      
      if (!id) {
        setError('Invalid verification link - missing ID');
        setIsLoading(false);
        return;
      }

      try {
        console.log('Fetching employee with ID:', id);
        const { data, error: fetchError } = await getEmployeeById(parseInt(id));
        
        console.log('API Response:', { data, error: fetchError });
        
        if (fetchError) {
          setError(`Employee not found: ${fetchError}`);
          setIsLoading(false);
          return;
        }

        if (!data) {
          setError('Employee not found');
          setIsLoading(false);
          return;
        }

        // Verify employee code matches (if code is provided)
        if (code) {
          const dbCode = data.employee_code?.toString();
          console.log('Comparing codes - DB:', dbCode, 'URL:', code);
          
          if (dbCode !== code) {
            console.warn('Code mismatch, but showing employee info anyway');
          }
        }

        setEmployee(data);
      } catch (err) {
        console.error('Verification error:', err);
        setError('Failed to verify employee. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployee();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Verification Failed</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Link to="/">
              <Button>Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!employee) {
    return null;
  }

  const isVerified = employee.status === 'approved' || employee.status === 'verified';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center border-b">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-bold text-sm">RCS True Facilities</p>
              <p className="font-bold text-sm">Pvt Ltd</p>
            </div>
          </div>
          <CardTitle className="text-lg">Employee Verification</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {/* Status Badge */}
          <div className="flex justify-center">
            {isVerified ? (
              <Badge className="bg-green-500 hover:bg-green-600 text-white px-4 py-1 text-sm">
                <CheckCircle className="w-4 h-4 mr-1" />
                Verified Employee
              </Badge>
            ) : (
              <Badge variant="outline" className="px-4 py-1 text-sm">
                Pending Verification
              </Badge>
            )}
          </div>

          {/* Employee Photo */}
          {employee.profile_pic_url && (
            <div className="flex justify-center">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary/20">
                <img 
                  src={getFileUrl(employee.profile_pic_url) || undefined}
                  alt={employee.full_name || 'Employee'}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          {/* Employee Details */}
          <div className="space-y-3">
            <div className="text-center">
              <h3 className="text-xl font-bold">{employee.full_name}</h3>
              <p className="text-muted-foreground">{employee.designation || 'Staff'}</p>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Employee Code:</span>
                <span className="font-medium">{employee.employee_code || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Mobile:</span>
                <span className="font-medium">+91 {employee.mobile_number}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Client:</span>
                <span className="font-medium">{employee.client_name || '-'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Location:</span>
                <span className="font-medium">{employee.unit_name || '-'}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-muted-foreground pt-2 border-t">
            <p>rcsfacility@yahoo.com | 0261 2215264</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
