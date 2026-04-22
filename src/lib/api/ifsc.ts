export interface IFSCData {
  BANK: string;
  BRANCH: string;
  ADDRESS: string;
  CITY: string;
  STATE: string;
  IFSC: string;
}

export async function verifyIFSC(ifscCode: string): Promise<{ success: boolean; data?: IFSCData; error?: string }> {
  try {
    const response = await fetch(`https://ifsc.razorpay.com/${ifscCode}`);
    
    if (!response.ok) {
      return { success: false, error: 'Invalid IFSC code' };
    }
    
    const data: IFSCData = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: 'Failed to verify IFSC code' };
  }
}
