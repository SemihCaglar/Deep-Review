import { Round } from './Round';

export class ChecklistItem {
  id: string;
  description: string;
  isChecked: boolean;

  // Relationships
  round: Round; // Many-to-one

  constructor(id: string, round: Round, description: string, isChecked: boolean = false) {}
}
