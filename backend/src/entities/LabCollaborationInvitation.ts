import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import type { Paper } from './Paper';
import type { Lab } from './Lab';

export enum CollaborationInvitationStatus {
  Pending = 'Pending',
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  Cancelled = 'Cancelled',
}

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
