import { Paper } from './Paper';
import { Assignment } from './Assignment';
import { ChecklistItem } from './ChecklistItem';
import { AIReviewReport } from './AIReviewReport';
import { LabMember } from './LabMember';

export enum RoundStatus {
  Open = 'Open',
  Closed = 'Closed'
}

export class Round {
  id: string;
  roundNumber: number;
  deadline: Date;
  status: RoundStatus;

  // Relationships
  paper: Paper; // Many-to-one
  proposedReviewers: LabMember[]; // Many-to-many
  assignments: Assignment[]; // One-to-many
  checklistItems: ChecklistItem[]; // One-to-many
  aiReviewReports: AIReviewReport[]; // One-to-many

  constructor(id: string, paper: Paper, roundNumber: number, deadline: Date) {}
}
