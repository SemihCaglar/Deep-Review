import { Round } from './Round';
import { LabMember } from './LabMember';
import { Summary } from './Summary';
import { Rating } from './Rating';
import { Extension } from './Extension';

export enum AssignmentStatus {
  Invited = 'Invited',
  Accepted = 'Accepted',
  Declined = 'Declined',
  Overdue = 'Overdue',
  Completed = 'Completed',
  Reassigned = 'Reassigned'
}

export class Assignment {
  id: string;
  status: AssignmentStatus;

  // Relationships
  round: Round; // Many-to-one
  reviewer: LabMember; // Many-to-one
  extension?: Extension; // One-to-one
  reviewSummary: Summary; // One-to-one
  rating: Rating; // One-to-one

  constructor(id: string, round: Round, reviewer: LabMember) {}
}
