import { Assignment } from './Assignment';
import { LabMember } from './LabMember';

export class Rating {
  id: string;
  qualityScore: number;
  quantityScore: number;
  timeScore: number;

  // Relationships
  assignment: Assignment; // One-to-one
  rater: LabMember; // Many-to-one

  constructor(id: string, assignment: Assignment, rater: LabMember, quality: number, quantity: number, time: number) {}
}
