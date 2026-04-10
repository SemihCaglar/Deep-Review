import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { Paper } from './Paper';
import { Assignment } from './Assignment';
import { ChecklistItem } from './ChecklistItem';
import { AIReviewReport } from './AIReviewReport';
import { User } from './User';

export enum RoundStatus {
  Open = 'Open',
  Closed = 'Closed'
}

@Entity()
export class Round {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roundNumber: number;

  @Column()
  deadline: Date;

  @Column({
    type: 'simple-enum',
    enum: RoundStatus,
    default: RoundStatus.Open
  })
  status: RoundStatus;

  @ManyToOne(() => Paper, paper => paper.rounds)
  paper: Paper;

  @ManyToMany(() => User)
  @JoinTable()
  proposedReviewers: User[];

  @OneToMany(() => Assignment, assignment => assignment.round)
  assignments: Assignment[];

  @OneToMany(() => ChecklistItem, checklist => checklist.round)
  checklistItems: ChecklistItem[];

  @OneToMany(() => AIReviewReport, report => report.round)
  aiReviewReports: AIReviewReport[];
}
