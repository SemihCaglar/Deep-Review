import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Lab } from './Lab';
import type { User } from './User';

export enum LabMembershipStatus {
  Pending = 'Pending',
  Active = 'Active',
  Alumni = 'Alumni',
}

@Entity()
@Unique(['userId', 'labId'])
export class LabMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('User', 'memberships', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne('Lab', 'memberships', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @Column()
  labId: string;

  @Column({
    type: 'simple-enum',
    enum: LabMembershipStatus,
  })
  status: LabMembershipStatus;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  statusChangedAt: Date | null;
}
