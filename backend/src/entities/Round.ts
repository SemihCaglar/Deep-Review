import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, ManyToMany, JoinTable, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import type { Paper } from './Paper';
import type { Assignment } from './Assignment';
import type { ChecklistItem } from './ChecklistItem';
import type { AIReviewReport } from './AIReviewReport';
import type { User } from './User';
import type { ReviewerResponse } from './ReviewerResponse';

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

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @ManyToOne('Paper', 'rounds')
  paper: Paper;

  @ManyToMany('User')
  @JoinTable()
  proposedReviewers: User[];

  @OneToMany('Assignment', 'round')
  assignments: Assignment[];

  @OneToMany('ReviewerResponse', 'reviewRound')
  reviewerResponses: ReviewerResponse[];

  @OneToMany('ChecklistItem', 'round')
  checklistItems: ChecklistItem[];

  @OneToMany('AIReviewReport', 'round')
  aiReviewReports: AIReviewReport[];
}
