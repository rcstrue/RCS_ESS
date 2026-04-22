export interface BasicInfo {
  mobileNumber: string;
}

export interface AadhaarDetails {
  fullName: string;
  fatherHusbandName: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Other' | '';
  aadhaarNumber: string;
  address: string;
  pinCode: string;
  state: string;
  district: string;
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountHolderName: string;
  confirmAccountNumber: string;
}

export interface AdditionalDetails {
  maritalStatus: 'Single' | 'Married' | 'Widowed' | 'Divorced' | '';
  bloodGroup: string;
  email: string;
  uanNumber: string;
  esicNumber: string;
  nomineeName: string;
  nomineeRelationship: 'father' | 'mother' | 'husband' | 'wife' | 'son' | 'daughter' | 'brother' | 'sister' | '';
  nomineeDob: string;
  nomineeContact: string;
}

export interface ClientUnitInfo {
  clientId: number | null;
  clientName: string;
  unitId: number | null;
  unitName: string;
  designation: string;
}

export interface DocumentImages {
  aadhaarFront: string | null;
  aadhaarBack: string | null;
  bankDocument: string | null;
  profilePic: string | null;
}

export interface RegistrationData {
  basicInfo: BasicInfo;
  aadhaarDetails: AadhaarDetails;
  bankDetails: BankDetails;
  additionalDetails: AdditionalDetails;
  clientUnitInfo: ClientUnitInfo;
  documents: DocumentImages;
}

export type RegistrationStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const STEPS = [
  { id: 1, title: 'Basic Info', shortTitle: 'Basic' },
  { id: 2, title: 'Aadhaar Front', shortTitle: 'Front' },
  { id: 3, title: 'Aadhaar Back', shortTitle: 'Back' },
  { id: 4, title: 'Bank Document', shortTitle: 'Bank' },
  { id: 5, title: 'Verify Bank', shortTitle: 'Verify' },
  { id: 6, title: 'Additional Info', shortTitle: 'Details' },
  { id: 7, title: 'Client & Unit', shortTitle: 'Client' },
  { id: 8, title: 'Review & Save', shortTitle: 'Review' },
] as const;

export const MARITAL_STATUS_OPTIONS = [
  { value: 'Single', label: 'Single' },
  { value: 'Married', label: 'Married' },
  { value: 'Widowed', label: 'Widowed' },
  { value: 'Divorced', label: 'Divorced' },
] as const;

export const BLOOD_GROUP_OPTIONS = [
  { value: 'not_known', label: 'Not Known' },
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
] as const;

export const RELATIONSHIP_OPTIONS = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'husband', label: 'Husband' },
  { value: 'wife', label: 'Wife' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'brother', label: 'Brother' },
  { value: 'sister', label: 'Sister' },
] as const;

export const CLIENTS_DATA = [
  {
    id: 'client1',
    name: 'Tata Consultancy Services',
    units: [
      { id: 'unit1', name: 'Mumbai - Andheri' },
      { id: 'unit2', name: 'Bangalore - Electronic City' },
      { id: 'unit3', name: 'Pune - Hinjewadi' },
    ],
  },
  {
    id: 'client2',
    name: 'Infosys Limited',
    units: [
      { id: 'unit4', name: 'Mysore - Campus' },
      { id: 'unit5', name: 'Hyderabad - Hitec City' },
    ],
  },
  {
    id: 'client3',
    name: 'Wipro Technologies',
    units: [
      { id: 'unit6', name: 'Chennai - Sholinganallur' },
      { id: 'unit7', name: 'Noida - Sector 63' },
    ],
  },
  {
    id: 'client4',
    name: 'Reliance Industries',
    units: [
      { id: 'unit8', name: 'Mumbai - BKC' },
      { id: 'unit9', name: 'Jamnagar - Refinery' },
    ],
  },
] as const;

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh',
] as const;
