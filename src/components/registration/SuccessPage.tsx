import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, MessageCircle, Loader2 } from 'lucide-react';
import { RegistrationData, RELATIONSHIP_OPTIONS } from '@/types/registration';
import { formatDateDDMMYYYY } from '@/lib/utils';

interface SuccessPageProps {
  data: RegistrationData;
  onComplete?: () => void;
}

export function SuccessPage({ data, onComplete }: SuccessPageProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [countdown, setCountdown] = useState(1);

  // Format name for greeting
  const name = data.aadhaarDetails.fullName || 'Employee';

  const getRelationshipLabel = (value: string) => {
    if (!value) return '';
    const option = RELATIONSHIP_OPTIONS.find(opt => opt.value === value);
    return option ? option.label : value.charAt(0).toUpperCase() + value.slice(1);
  };

  // Build WhatsApp message with all form data
  const buildWhatsAppMessage = useCallback(() => {
    const client = data.clientUnitInfo.clientName || '';
    const unit = data.clientUnitInfo.unitName || '';
    const mobile = data.basicInfo.mobileNumber || '';
    const aadhaar = data.aadhaarDetails.aadhaarNumber || '';
    const dob = formatDateDDMMYYYY(data.aadhaarDetails.dateOfBirth) || '';
    const father = data.aadhaarDetails.fatherHusbandName || '';
    const address = data.aadhaarDetails.address || '';
    const pincode = data.aadhaarDetails.pinCode || '';
    const district = data.aadhaarDetails.district || '';
    const state = data.aadhaarDetails.state || '';
    const bank = data.bankDetails.bankName || '';
    const accNo = data.bankDetails.accountNumber || '';
    const ifsc = data.bankDetails.ifscCode || '';
    const accHolder = data.bankDetails.accountHolderName || '';
    const nominee = data.additionalDetails.nomineeName || '';
    const nomineeRel = getRelationshipLabel(data.additionalDetails.nomineeRelationship);
    const nomineeDob = formatDateDDMMYYYY(data.additionalDetails.nomineeDob) || '';
    const nomineeContact = data.additionalDetails.nomineeContact || '';
    const maritalStatus = data.additionalDetails.maritalStatus || '';
    const email = data.additionalDetails.email || '';
    const uan = data.additionalDetails.uanNumber || '';
    const esic = data.additionalDetails.esicNumber || '';
    const designation = data.clientUnitInfo.designation || '';
    const gender = data.aadhaarDetails.gender || '';

    const message = `*Employee Registration Form*

Dear Madam,

I *${name}* am working at *${client}* - ${unit}.

━━━━━━━━━━━━━━━━━━
*PERSONAL DETAILS*
━━━━━━━━━━━━━━━━━━
📱 Mobile: +91 ${mobile}
🎂 DOB: ${dob}
👤 Gender: ${gender}
👨 Father/Husband: ${father}
💑 Marital Status: ${maritalStatus}
📧 Email: ${email || 'N/A'}

━━━━━━━━━━━━━━━━━━
*ADDRESS*
━━━━━━━━━━━━━━━━━━
🏠 ${address}
📍 ${district}, ${state} - ${pincode}

━━━━━━━━━━━━━━━━━━
*AADHAAR DETAILS*
━━━━━━━━━━━━━━━━━━
📋 Aadhaar: ${aadhaar}

━━━━━━━━━━━━━━━━━━
*BANK DETAILS*
━━━━━━━━━━━━━━━━━━
🏦 Bank: ${bank}
💳 Account: ${accNo}
🔢 IFSC: ${ifsc}
👤 Holder: ${accHolder}

━━━━━━━━━━━━━━━━━━
*NOMINEE DETAILS*
━━━━━━━━━━━━━━━━━━
👤 Name: ${nominee}
🔗 Relation: ${nomineeRel}
🎂 DOB: ${nomineeDob}
📱 Contact: +91 ${nomineeContact}

━━━━━━━━━━━━━━━━━━
*EMPLOYMENT DETAILS*
━━━━━━━━━━━━━━━━━━
🏢 Client: ${client}
📍 Unit: ${unit}
💼 Designation: ${designation || 'N/A'}

━━━━━━━━━━━━━━━━━━
*ID NUMBERS*
━━━━━━━━━━━━━━━━━━
UAN: ${uan || 'N/A'}
ESIC: ${esic || 'N/A'}

━━━━━━━━━━━━━━━━━━

Requesting you to approve my employee registration form.

Thank you 🙏`;

    return encodeURIComponent(message);
  }, [data, name]);

  const openWhatsApp = useCallback(() => {
    const message = buildWhatsAppMessage();
    const phoneNumber = '918469241414';
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  }, [buildWhatsAppMessage]);

  // Auto redirect to WhatsApp after 1 second
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRedirecting(true);
      openWhatsApp();
    }, 1000);

    // Countdown timer
    const countdownTimer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    // Call onComplete after WhatsApp redirect (5 seconds total)
    const completeTimer = setTimeout(() => {
      onComplete?.();
    }, 5000);

    return () => {
      clearTimeout(timer);
      clearInterval(countdownTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete, openWhatsApp]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-600">
      <div className="w-full max-w-sm mx-4 text-center animate-fade-in">
        {/* Success Icon */}
        <div className="mb-6 animate-bounce-in">
          <div className="w-24 h-24 mx-auto bg-white rounded-full flex items-center justify-center shadow-2xl">
            <CheckCircle2 className="w-14 h-14 text-green-500" />
          </div>
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold text-white mb-2">
          Success!
        </h1>
        <p className="text-lg text-white/90 mb-2">
          Your form has been submitted successfully!
        </p>

        {/* Redirect Message */}
        <div className="flex items-center justify-center gap-2 text-white/80 mb-6">
          {isRedirecting ? (
            <>
              <MessageCircle className="w-5 h-5" />
              <span>Opening WhatsApp...</span>
            </>
          ) : (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Redirecting to WhatsApp in {countdown}s...</span>
            </>
          )}
        </div>

        {/* WhatsApp Button */}
        <button
          onClick={openWhatsApp}
          className="w-full bg-white text-green-600 font-semibold py-3 px-6 rounded-xl shadow-lg hover:bg-green-50 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-5 h-5" />
          Open WhatsApp Now
        </button>

        {/* Employee Name */}
        <p className="mt-6 text-white/70 text-sm">
          Employee: {name}
        </p>
      </div>

      {/* Decorative circles */}
      <div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute bottom-10 right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
    </div>
  );
}
