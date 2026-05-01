import * as nodemailer from 'nodemailer';
import { AppDataSource } from '../data-source';
import { EmailNotification, EmailStatus } from '../entities/EmailNotification';
import type { User } from '../entities/User';

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? parseInt(SMTP_PORT) : 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false },
  });
}

export async function sendEmail(recipient: User, subject: string, body: string): Promise<void> {
  const notificationRepo = AppDataSource.getRepository(EmailNotification);

  const notification = notificationRepo.create({
    recipient,
    subject,
    body,
    status: EmailStatus.Pending,
  });
  await notificationRepo.save(notification);

  const transport = createTransport();
  if (!transport) {
    console.warn(`[emailService] SMTP not configured — skipping send to ${recipient.email}: "${subject}"`);
    notification.status = EmailStatus.Failed;
    await notificationRepo.save(notification);
    return;
  }

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: recipient.email,
      subject,
      text: body,
    });
    notification.status = EmailStatus.Sent;
    notification.sentAt = new Date();
  } catch (err) {
    console.error(`[emailService] Failed to send email to ${recipient.email}:`, err);
    notification.status = EmailStatus.Failed;
  }

  await notificationRepo.save(notification);
}
