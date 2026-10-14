// Dev-mode mailer: logs to console. Wire SMTP/Nodemailer here in phase 2.
export async function sendMail({ to, subject, text }) {
  console.log(`[mail] to=${to} subject=${subject}\n${text}`);
  return { delivered: false, mode: 'console-log' };
}
