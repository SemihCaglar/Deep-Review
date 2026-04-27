import {
  Check,
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
import type { ReviewerResponse } from './ReviewerResponse';
import type { User } from './User';

@Entity()
@Unique(['assignment'])
@Unique(['reviewerResponse'])
@Check('CHK_review_feedback_quality_1_5', 'quality >= 1 AND quality <= 5')
@Check('CHK_review_feedback_quantity_1_5', 'quantity >= 1 AND quantity <= 5')
@Check('CHK_review_feedback_timeliness_1_5', 'timeliness >= 1 AND timeliness <= 5')
export class ReviewFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  quality: number;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'integer' })
  timeliness: number;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @OneToOne('Assignment', 'feedback', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  assignment: Assignment;

  @OneToOne('ReviewerResponse', 'feedback', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  reviewerResponse: ReviewerResponse | null;

  @ManyToOne('User', 'reviewFeedbacks', { nullable: false, onDelete: 'CASCADE' })
  author: User;
}
