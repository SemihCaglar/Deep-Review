import { ChildEntity, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { User } from './User';
import { Paper } from './Paper';
import { Topic } from './Topic';
import { Assignment } from './Assignment';
import { BlackoutPeriod } from './BlackoutPeriod';

@ChildEntity()
export class LabMember extends User {
  @ManyToMany(() => Paper, paper => paper.authors)
  @JoinTable()
  writtenPapers: Paper[];

  @ManyToMany(() => Topic)
  @JoinTable()
  interests: Topic[];

  @OneToMany(() => Assignment, assignment => assignment.reviewer)
  assignments: Assignment[];

  @OneToMany(() => BlackoutPeriod, blackout => blackout.member)
  blackoutPeriods: BlackoutPeriod[];
}
