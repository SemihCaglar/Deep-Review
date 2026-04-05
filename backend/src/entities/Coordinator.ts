import { ChildEntity, OneToMany } from 'typeorm';
import { User } from './User';
import { Paper } from './Paper';

@ChildEntity()
export class Coordinator extends User {
  @OneToMany(() => Paper, paper => paper.coordinator)
  coordinatedPapers: Paper[];
}
