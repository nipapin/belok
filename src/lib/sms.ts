const SMS_RU_API_KEY = process.env.SMS_RU_API_KEY!;

export async function sendSms(phone: string, message: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[SMS DEV] To: ${phone}, Message: ${message}`);
    return true;
  }

  try {
    const params = new URLSearchParams({
      api_id: SMS_RU_API_KEY,
      to: phone.replace('+', ''),
      msg: message,
      json: '1',
    });

    const response = await fetch(`https://sms.ru/sms/send?${params.toString()}`);
    const data = await response.json();
    return data.status === 'OK';
  } catch (error) {
    console.error('SMS sending failed:', error);
    return false;
  }
}

export function generateCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
