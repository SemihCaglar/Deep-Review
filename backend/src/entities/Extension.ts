import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Assignment } from './Assignment';

export enum ExtensionStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected'
}

@Entity()
export class Extension {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  reason: string;

  @Column({ type: 'datetime' })
  requestedDeadline: Date;

  @Column({ type: 'datetime', nullable: true })
  approvedDeadline: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  requestedAt: Date;

  @Column({
    type: 'simple-enum',
    enum: ExtensionStatus,
    default: ExtensionStatus.Pending
  })
  status: ExtensionStatus;

  @Column({ default: false })
  dismissedByReviewer: boolean;

  @ManyToOne(() => Assignment, assignment => assignment.extensions, { nullable: false, onDelete: 'CASCADE' })
  assignment: Assignment;
}
