import jsPDF from 'jspdf';
import type { RegistrationData } from '@/types/registration';

export async function generateRegistrationPDF(data: RegistrationData): Promise<Blob> {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = 20;

  // Title
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Employee Registration Form', pageWidth / 2, y, { align: 'center' });
  y += 15;

  // Status Badge
  pdf.setFontSize(10);
  pdf.setTextColor(255, 165, 0);
  pdf.text('Status: Pending HR Verification', pageWidth / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 15;

  // Profile Picture (if available)
  if (data.documents.profilePic) {
    try {
      pdf.addImage(data.documents.profilePic, 'JPEG', 15, y, 30, 35);
      // Name next to photo
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(data.aadhaarDetails.fullName || 'Employee Name', 50, y + 15);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Mobile: +91 ${data.basicInfo.mobileNumber}`, 50, y + 22);
      pdf.text(`Aadhaar: ${data.aadhaarDetails.aadhaarNumber}`, 50, y + 29);
      y += 45;
    } catch (e) {
      // If image fails, just add text
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(data.aadhaarDetails.fullName || 'Employee Name', 15, y);
      y += 10;
    }
  }

  // Section: Personal Details
  y += 5;
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFillColor(240, 240, 240);
  pdf.rect(15, y, pageWidth - 30, 8, 'F');
  pdf.text('Personal Details', 17, y + 6);
  y += 15;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  
  const personalDetails = [
    ['Full Name', data.aadhaarDetails.fullName],
    ['Date of Birth', data.aadhaarDetails.dateOfBirth],
    ['Gender', data.aadhaarDetails.gender ? data.aadhaarDetails.gender.charAt(0).toUpperCase() + data.aadhaarDetails.gender.slice(1) : ''],
    ['Marital Status', data.additionalDetails.maritalStatus ? data.additionalDetails.maritalStatus.charAt(0).toUpperCase() + data.additionalDetails.maritalStatus.slice(1) : ''],
    ['Mobile Number', `+91 ${data.basicInfo.mobileNumber}`],
    ['Email', data.additionalDetails.email || 'N/A'],
    ['Blood Group', data.additionalDetails.bloodGroup || 'N/A'],
  ];

  personalDetails.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${label}:`, 17, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value || 'N/A', 70, y);
    y += 7;
  });

  // Section: Address
  y += 5;
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFillColor(240, 240, 240);
  pdf.rect(15, y, pageWidth - 30, 8, 'F');
  pdf.text('Address', 17, y + 6);
  y += 15;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(data.aadhaarDetails.address || 'N/A', 17, y, { maxWidth: pageWidth - 34 });
  y += 7;
  pdf.text(`${data.aadhaarDetails.district}, ${data.aadhaarDetails.state} - ${data.aadhaarDetails.pinCode}`, 17, y);
  y += 12;

  // Section: Bank Details
  y += 5;
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFillColor(240, 240, 240);
  pdf.rect(15, y, pageWidth - 30, 8, 'F');
  pdf.text('Bank Details', 17, y + 6);
  y += 15;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  
  const bankDetails = [
    ['Bank Name', data.bankDetails.bankName],
    ['Account Number', data.bankDetails.accountNumber],
    ['IFSC Code', data.bankDetails.ifscCode],
    ['Account Holder', data.bankDetails.accountHolderName],
  ];

  bankDetails.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${label}:`, 17, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value || 'N/A', 70, y);
    y += 7;
  });

  // Section: Assignment Details
  y += 10;
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFillColor(240, 240, 240);
  pdf.rect(15, y, pageWidth - 30, 8, 'F');
  pdf.text('Assignment Details', 17, y + 6);
  y += 15;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  
  const assignmentDetails = [
    ['Client', data.clientUnitInfo.clientName],
    ['Unit/Location', data.clientUnitInfo.unitName],
  ];

  assignmentDetails.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${label}:`, 17, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value || 'N/A', 70, y);
    y += 7;
  });

  // Section: Nominee Details
  y += 10;
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFillColor(240, 240, 240);
  pdf.rect(15, y, pageWidth - 30, 8, 'F');
  pdf.text('Nominee Details', 17, y + 6);
  y += 15;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  
  const nomineeDetails = [
    ['Nominee Name', data.additionalDetails.nomineeName],
    ['Relationship', data.additionalDetails.nomineeRelationship ? data.additionalDetails.nomineeRelationship.charAt(0).toUpperCase() + data.additionalDetails.nomineeRelationship.slice(1) : ''],
    ['Nominee DOB', data.additionalDetails.nomineeDob],
    ['Nominee Contact', data.additionalDetails.nomineeContact ? `+91 ${data.additionalDetails.nomineeContact}` : 'N/A'],
  ];

  nomineeDetails.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${label}:`, 17, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value || 'N/A', 70, y);
    y += 7;
  });

  // Section: ID Numbers (if present)
  if (data.additionalDetails.uanNumber || data.additionalDetails.esicNumber) {
    y += 10;
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(240, 240, 240);
    pdf.rect(15, y, pageWidth - 30, 8, 'F');
    pdf.text('ID Numbers', 17, y + 6);
    y += 15;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    
    if (data.additionalDetails.uanNumber) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('UAN Number:', 17, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(data.additionalDetails.uanNumber, 70, y);
      y += 7;
    }
    if (data.additionalDetails.esicNumber) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('ESIC Number:', 17, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(data.additionalDetails.esicNumber, 70, y);
      y += 7;
    }
  }

  // Footer
  y = pdf.internal.pageSize.getHeight() - 30;
  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  pdf.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, y, { align: 'center' });
  pdf.text('This is an auto-generated document. Please verify all details.', pageWidth / 2, y + 5, { align: 'center' });

  return pdf.output('blob');
}

export function shareViaWhatsApp(employeeName: string, clientName: string, unitName: string) {
  const message = encodeURIComponent(
    `Dear Madam,\nI ${employeeName} am working at ${clientName} ${unitName}\nRequesting you to approve my employee registration form.\nThank you.`
  );
  const phoneNumber = '918469241414';
  window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
}
