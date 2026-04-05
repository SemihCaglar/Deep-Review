import { User } from './User';
import { Paper } from './Paper';
import { Round } from './Round';

export class Coordinator extends User {
  // A coordinator manages specific papers
  coordinatedPapers: Paper[]; // One-to-many

  constructor(id: string, name: string, email: string) {
    super(id, name, email);
  }
}
