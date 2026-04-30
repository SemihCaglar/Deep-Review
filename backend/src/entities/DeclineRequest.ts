import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Assignment } from './Assignment';

export enum DeclineRequestStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected'
}

@Entity()
export class DeclineRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  reason: string;

  @Column({
    type: 'simple-enum',
    enum: DeclineRequestStatus,
    default: DeclineRequestStatus.Pending
  })
  status: DeclineRequestStatus;

  @Column({ default: false })
  dismissedByReviewer: boolean;

  @CreateDateColumn({ type: 'datetime' })
  requestedAt: Date;

  @ManyToOne(() => Assignment, assignment => assignment.declineRequests, { nullable: false, onDelete: 'CASCADE' })
  assignment: Assignment;
}
