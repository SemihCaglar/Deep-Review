import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, OneToMany, JoinColumn, CreateDateColumn } from 'typeorm';
import type { Round } from './Round';
import type { Summary } from './Summary';
import type { Rating } from './Rating';
import type { Extension } from './Extension';
import type { User } from './User';
import type { DeclineRequest } from './DeclineRequest';

export enum AssignmentStatus {
  Invited = 'Invited',
  Accepted = 'Accepted',
  Declined = 'Declined',
  Overdue = 'Overdue',
  Completed = 'Completed',
  Reassigned = 'Reassigned',
  Cancelled = 'Cancelled'
}

@Entity()
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

  @Column({ default: false })
  invitationSent: boolean;

  @CreateDateColumn({ type: 'datetime' })
  invitedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  declineReason: string | null;

  @ManyToOne('Round', 'assignments', { nullable: false, onDelete: 'CASCADE' })
  round: Round;

  @ManyToOne('User', 'assignments', { nullable: false, onDelete: 'CASCADE' })
  reviewer: User;

  @OneToMany('Extension', 'assignment')
  extensions: Extension[];

  @OneToOne('Summary', 'assignment', { nullable: true })
  reviewSummary: Summary;

  @OneToOne('Rating', 'assignment', { nullable: true })
  rating: Rating;

  @OneToMany('DeclineRequest', 'assignment')
  declineRequests: DeclineRequest[];
}
