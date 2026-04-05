export class EmailService {
  sendNotification(userId: string, subject: string, body: string): void {}
  sendPasswordResetEmail(email: string, resetLink: string): void {}
  retryFailedEmails(): void {}
}
