import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, ManyToMany, JoinTable, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import type { Paper } from './Paper';
import type { Assignment } from './Assignment';
import type { ChecklistItem } from './ChecklistItem';
import type { AIReviewReport } from './AIReviewReport';
import type { User } from './User';
import type { ReviewerResponse } from './ReviewerResponse';

export enum RoundStatus {
  Draft = 'Draft',
  Open = 'Open',
  Completed = 'Completed'
}

export enum VenueCategory {
  Conference = 'Conference',
  Journal = 'Journal'
}

@Entity()
export class Round {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roundNumber: number;

  @Column({ type: 'datetime', nullable: true })
  deadline: Date | null;

  @Column({
    type: 'simple-enum',
    enum: RoundStatus,
    default: RoundStatus.Draft
  })
  status: RoundStatus;

  @Column()
  targetVenue: string;

  @Column({
    type: 'simple-enum',
    enum: VenueCategory,
  })
  venueCategory: VenueCategory;

  @Column({ type: 'datetime', nullable: true })
  submissionDeadline: Date | null;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

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

  @Column({ type: 'simple-json', nullable: true })
  aiReviewReport: any;

  @Column({ type: 'simple-json', nullable: true })
  complianceReport: any;

  @Column({ nullable: true })
  annotatedPdfUrl: string;

  @Column({ nullable: true })
  sourceZipUrl: string;
}
