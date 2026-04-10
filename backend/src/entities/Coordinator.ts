import { ChildEntity, OneToMany } from 'typeorm';
import { User, UserRole } from './User';
import { Paper } from './Paper';

@ChildEntity()
export class Coordinator extends User {
  constructor() {
    super();
    this.role = UserRole.Coordinator;
  }

  @OneToMany(() => Paper, paper => paper.coordinator)
  coordinatedPapers: Paper[];
}
