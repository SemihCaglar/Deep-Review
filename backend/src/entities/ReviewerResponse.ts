import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { Assignment } from './Assignment';
import type { Lab } from './Lab';
import type { ReviewFeedback } from './ReviewFeedback';
import type { Round } from './Round';
import type { User } from './User';

export enum ReviewerResponseStatus {
  Invited = 'Invited',
  Accepted = 'Accepted',
  Declined = 'Declined',
  PendingExtension = 'PendingExtension',
  PendingDecline = 'PendingDecline',
  Submitted = 'Submitted',
}

@Entity()
@Unique(['assignment'])
export class ReviewerResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'simple-enum',
    enum: ReviewerResponseStatus,
    default: ReviewerResponseStatus.Invited,
  })
  status: ReviewerResponseStatus;

  @Column({ type: 'text', nullable: true })
  declineReason: string | null;

  @Column({ type: 'text', nullable: true })
  extensionReason: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @OneToOne('Assignment', 'response', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  assignment: Assignment;

  // Compatibility links for code that was written against the original ReviewerResponse shape.
  // Assignment remains the canonical source for reviewer, round, deadline, and lifecycle state.
  @ManyToOne('User', 'reviewerResponses', { nullable: true, onDelete: 'SET NULL' })
  reviewer: User | null;

  @ManyToOne('Round', 'reviewerResponses', { nullable: true, onDelete: 'SET NULL' })
  reviewRound: Round | null;

  @ManyToOne('Lab', 'reviewerResponses', { nullable: true, onDelete: 'SET NULL' })
  lab: Lab | null;

  @OneToOne('ReviewFeedback', 'reviewerResponse', { nullable: true })
  feedback: ReviewFeedback | null;
}
