export class SMSService {
  static async sendOTP(phone: string, code: string): Promise<boolean> {
    console.log(`[SMS MOCK] Sending OTP ${code} to ${phone}`);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  }
}
