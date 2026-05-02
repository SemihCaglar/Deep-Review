import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import type { Paper } from './Paper';
import type { Lab } from './Lab';

export enum CollaborationInvitationStatus {
  Pending = 'Pending',
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  Cancelled = 'Cancelled',
}

// SQLite does not support partial/filtered unique indexes, so the one-pending-invite-per-paper+lab
// invariant is enforced in application code (sendInvitations) + the transaction lock in acceptInvitation.
@Entity()
export class LabCollaborationInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Paper', { onDelete: 'CASCADE' })
  paper: Paper;

  @ManyToOne('Lab', { onDelete: 'CASCADE' })
  invitingLab: Lab;

  @ManyToOne('Lab', { onDelete: 'CASCADE' })
  invitedLab: Lab;

  @Column({
    type: 'simple-enum',
    enum: CollaborationInvitationStatus,
    default: CollaborationInvitationStatus.Pending,
  })
  status: CollaborationInvitationStatus;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  respondedAt: Date | null;
}
