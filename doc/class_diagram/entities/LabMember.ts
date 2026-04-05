import { User } from './User';
import { Paper } from './Paper';
import { Topic } from './Topic';
import { Assignment } from './Assignment';
import { BlackoutPeriod } from './BlackoutPeriod';

export class LabMember extends User {
  writtenPapers: Paper[]; // Many-to-many
  interests: Topic[]; // Many-to-many
  assignments: Assignment[]; // One-to-many
  blackoutPeriods: BlackoutPeriod[]; // One-to-many

  constructor(id: string, name: string, email: string) {
    super(id, name, email);
  }
}
