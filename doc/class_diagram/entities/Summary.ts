import { Assignment } from './Assignment';

export class Summary {
  id: string;
  text: string;

  // Relationships
  assignment: Assignment; // One-to-one

  constructor(id: string, assignment: Assignment, text: string) {}
}
