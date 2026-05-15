import { Resend } from 'resend';

let cachedResend: Resend | null = null;
let cachedResendKey = '';

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  if (cachedResend && cachedResendKey === apiKey) return cachedResend;

  cachedResend = new Resend(apiKey);
  cachedResendKey = apiKey;
  return cachedResend;
}

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

async function sendEmail({ to, subject, text, html }: SendEmailParams): Promise<void> {
  const resend = getResend();
  const from = process.env.EMAIL_FROM || 'Belok <welcome@belok.pro>';

  if (!resend) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'RESEND_API_KEY не задан. Добавьте его в переменные окружения для production.'
      );
    }
    logDevEmail({ to, subject, text });
    return;
  }

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    text,
    html: html ?? text,
  });

  if (error) {
    // В dev логируем письмо в консоль, чтобы код подтверждения не потерялся,
    // но всё равно бросаем ошибку — чтобы вызывающий код узнал о проблеме.
    if (process.env.NODE_ENV !== 'production') {
      logDevEmail({ to, subject, text });
    }
    throw new Error(`Resend: не удалось отправить письмо — ${error.message}`);
  }
}

function logDevEmail({ to, subject, text }: SendEmailParams) {
  const banner = '═'.repeat(72);
  console.log(`\n${banner}`);
  console.log(`📧  DEV EMAIL  →  ${to}`);
  console.log(`    Subject: ${subject}`);
  console.log(`${banner}`);
  for (const line of text.split('\n')) console.log(`    ${line}`);
  console.log(`${banner}\n`);
}

export async function sendVerificationCode(to: string, code: string): Promise<void> {
  const subject = `Код подтверждения email в Belok: ${code}`;
  const text =
    `Здравствуйте!\n\n` +
    `Ваш код подтверждения email в приложении Belok:\n\n` +
    `    ${code}\n\n` +
    `Код действителен 10 минут. Если вы не запрашивали код — просто проигнорируйте это письмо.\n`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <p>Здравствуйте!</p>
      <p>Ваш код подтверждения email в приложении <b>Belok</b>:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;background:#f5f5f5;padding:16px 24px;border-radius:12px;text-align:center;font-variant-numeric:tabular-nums">${code}</p>
      <p style="color:#666;font-size:13px">Код действителен 10 минут. Если вы не запрашивали код — проигнорируйте это письмо.</p>
    </div>
  `;
  await sendEmail({ to, subject, text, html });
}
