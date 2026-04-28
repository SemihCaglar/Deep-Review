import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  TableInheritance,
  UpdateDateColumn,
} from 'typeorm';
import type { Assignment } from './Assignment';
import type { BlackoutPeriod } from './BlackoutPeriod';
import type { EmailNotification } from './EmailNotification';
import type { Paper } from './Paper';
import type { Topic } from './Topic';
import type { Lab } from './Lab';

export enum UserRole {
  LabMember = 'LabMember',
  Coordinator = 'Coordinator',
  LocalAdmin = 'LocalAdmin',
  GlobalAdmin = 'GlobalAdmin',
}

export enum ApprovalStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

@Entity()
@TableInheritance({ column: { type: 'varchar', name: 'type' } })
export abstract class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({
    type: 'simple-enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column({
    type: 'simple-enum',
    enum: ApprovalStatus,
    default: ApprovalStatus.Pending,
  })
  approvalStatus: ApprovalStatus;

  @Column({ type: 'datetime', nullable: true })
  approvalReviewedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  approvalNote: string | null;

  @Column({ default: 0 })
  failedLogins: number;

  @Column({ type: 'datetime', nullable: true })
  failedLoginWindowStartedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @ManyToMany('Paper', 'authors')
  @JoinTable()
  writtenPapers: Paper[];

  @ManyToMany('Topic')
  @JoinTable()
  interests: Topic[];

  @Column({ type: 'simple-json', nullable: true })
  otherInterests: string[] | null;

  @OneToMany('Assignment', 'reviewer')
  assignments: Assignment[];

  @OneToMany('BlackoutPeriod', 'member', { cascade: true })
  blackoutPeriods: BlackoutPeriod[];

  @OneToMany('EmailNotification', 'recipient')
  notifications: EmailNotification[];

  @ManyToMany('Lab', 'members')
  labs: Lab[];

  @ManyToOne('Lab')
  @JoinColumn()
  requestedLab: Lab | null;
}
