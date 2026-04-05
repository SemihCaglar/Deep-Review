import { Assignment } from './Assignment';

export enum ExtensionStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected'
}

export class Extension {
  id: string;
  reason: string;
  acceptedDate?: Date;
  status: ExtensionStatus;

  // Relationships
  assignment: Assignment; // Many-to-one (An assignment can technically have multiple extension requests over time)

  constructor(id: string, assignment: Assignment, reason: string) {}
}
