import { EmailNotification } from './EmailNotification';

export abstract class User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string[];
  
  failedLogins: number;
  lockedUntil?: Date;

  // Relationships
  notifications: EmailNotification[]; // One-to-many

  constructor(id: string, name: string, email: string) {}
}
