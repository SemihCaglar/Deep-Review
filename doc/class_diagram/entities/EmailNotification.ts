import { User } from './User';

export enum EmailStatus {
  Pending = 'Pending',
  Sent = 'Sent',
  Failed = 'Failed'
}

export class EmailNotification {
  id: string;
  subject: string;
  body: string;
  sentAt?: Date;
  status: EmailStatus;

  // Relationships
  recipient: User; // Many-to-one

  constructor(id: string, recipient: User, subject: string, body: string) {}
}
