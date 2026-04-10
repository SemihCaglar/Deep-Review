import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  TableInheritance,
  UpdateDateColumn,
} from 'typeorm';
import { Assignment } from './Assignment';
import { BlackoutPeriod } from './BlackoutPeriod';
import { EmailNotification } from './EmailNotification';
import { Paper } from './Paper';
import { Topic } from './Topic';

export enum UserRole {
  LabMember = 'LabMember',
  Coordinator = 'Coordinator',
  Admin = 'Admin',
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

  @ManyToMany(() => Paper, paper => paper.authors)
  @JoinTable()
  writtenPapers: Paper[];

  @ManyToMany(() => Topic)
  @JoinTable()
  interests: Topic[];

  @OneToMany(() => Assignment, assignment => assignment.reviewer)
  assignments: Assignment[];

  @OneToMany(() => BlackoutPeriod, blackout => blackout.member, { cascade: true })
  blackoutPeriods: BlackoutPeriod[];

  @OneToMany(() => EmailNotification, notification => notification.recipient)
  notifications: EmailNotification[];
}
