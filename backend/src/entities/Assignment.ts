import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, JoinColumn } from 'typeorm';
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
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'simple-enum',
    enum: AssignmentStatus,
    default: AssignmentStatus.Invited
  })
  status: AssignmentStatus;

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
