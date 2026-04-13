import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, JoinColumn, Unique } from 'typeorm';
import type { Round } from './Round';
import type { Summary } from './Summary';
import type { Rating } from './Rating';
import type { Extension } from './Extension';
import type { User } from './User';

export enum AssignmentStatus {
  Invited = 'Invited',
  Accepted = 'Accepted',
  Declined = 'Declined',
  Overdue = 'Overdue',
  Completed = 'Completed',
  Reassigned = 'Reassigned'
}

@Entity()
@Unique(['round', 'reviewer'])
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'simple-enum',
    enum: AssignmentStatus,
    default: AssignmentStatus.Invited
  })
  status: AssignmentStatus;

  @Column({ type: 'datetime', nullable: true })
  deadline: Date | null;

  @Column({ type: 'datetime' })
  invitedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  declineReason: string | null;

  @Column({ default: false })
  reliabilityFlag: boolean;

  @ManyToOne('Round', 'assignments')
  round: Round;

  @ManyToOne('User', 'assignments')
  reviewer: User;

  @OneToOne('Extension', 'assignment', { nullable: true })
  extension: Extension;

  @OneToOne('Summary', 'assignment', { nullable: true })
  reviewSummary: Summary;

  @OneToOne('Rating', 'assignment', { nullable: true })
  rating: Rating;
}
