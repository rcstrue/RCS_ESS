import { QRCodeSVG } from 'qrcode.react';
import { getFileUrl } from '@/lib/api/config';
import { Employee } from '@/hooks/useEmployeeSession';

interface IDCardProps {
  employee: Employee;
}

export function IDCard({ employee }: IDCardProps) {
  const profilePic = getFileUrl(employee.profile_pic_url || employee.profile_pic_cropped_url);
  const employeeCode = employee.employee_code || 'N/A';
  const fullName = employee.full_name || 'Employee';
  const designation = employee.designation || 'Staff';
  const clientName = employee.client_name || '';
  const unitName = employee.unit_name || '';
  const bloodGroup = employee.blood_group || '';

  // QR code - verification URL (hash-based for static hosting)
  const verifyUrl = `https://join.rcsfacility.com/#/verify?id=${employee.id}&code=${employeeCode}`;

  return (
    <div className="bg-gradient-to-b from-primary via-primary to-primary/95 rounded-xl overflow-hidden shadow-2xl max-w-[300px] mx-auto border-2 border-primary/30">
      {/* Header with Logo */}
      <div className="bg-white px-4 py-2 flex items-center gap-3">
        {/* Logo - No border, larger */}
        <div className="flex-shrink-0">
          <img 
            src="/logo.png" 
            alt="RCS Logo" 
            className="w-16 h-16 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const parent = e.currentTarget.parentElement;
              if (parent) {
                parent.innerHTML = '<span class="text-primary font-bold text-lg">RCS</span>';
              }
            }}
          />
        </div>
        {/* Company Name */}
        <div className="flex-1">
          <h2 className="text-primary font-bold text-sm leading-tight">
            RCS True Facilities Pvt Ltd
          </h2>
          <p className="text-primary/60 text-[10px]">Employee Identity Card</p>
        </div>
        {/* Employee Code */}
        <div className="text-right flex-shrink-0">
          <p className="text-primary/60 text-[9px]">Emp Code</p>
          <p className="text-primary font-bold text-base">{employeeCode}</p>
        </div>
      </div>

      {/* Body - Compact Layout */}
      <div className="px-3 py-3 flex gap-3">
        {/* Photo */}
        <div className="flex-shrink-0">
          <div className="w-20 h-24 rounded-lg overflow-hidden bg-white/20 border-2 border-white/40 shadow-lg">
            {profilePic ? (
              <img
                src={profilePic}
                alt={fullName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/10">
                <span className="text-white/50 text-[10px]">No Photo</span>
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 text-white min-w-0">
          <h3 className="font-bold text-base leading-tight truncate">{fullName}</h3>
          <p className="text-white/80 text-xs">{designation}</p>

          <div className="mt-2 space-y-1 text-[11px]">
            <div className="flex justify-between items-center bg-white/10 rounded px-2 py-1">
              <span className="text-white/60">Client:</span>
              <span className="font-medium truncate ml-1 max-w-[100px]">{clientName || '-'}</span>
            </div>
            <div className="flex justify-between items-center bg-white/10 rounded px-2 py-1">
              <span className="text-white/60">Location:</span>
              <span className="font-medium truncate ml-1 max-w-[100px]">{unitName || '-'}</span>
            </div>
            <div className="flex justify-between items-center bg-white/10 rounded px-2 py-1">
              <span className="text-white/60">Mobile:</span>
              <span className="font-medium">+91 {employee.mobile_number}</span>
            </div>
            {bloodGroup && (
              <div className="flex justify-between items-center bg-white/10 rounded px-2 py-1">
                <span className="text-white/60">Blood:</span>
                <span className="bg-red-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">{bloodGroup}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer with QR */}
      <div className="bg-white/10 px-3 py-2 flex items-center justify-between border-t border-white/10">
        <div className="text-white/70 text-[9px] space-y-0.5">
          <p className="font-medium text-white/90">Valid: {new Date().getFullYear() + 1}</p>
          <p>rcsfacility@yahoo.com | 0261 2215264</p>
        </div>
        <div className="bg-white p-1 rounded shadow-md">
          <QRCodeSVG
            value={verifyUrl}
            size={42}
            level="M"
            bgColor="white"
            fgColor="hsl(var(--primary))"
          />
        </div>
      </div>
    </div>
  );
}
