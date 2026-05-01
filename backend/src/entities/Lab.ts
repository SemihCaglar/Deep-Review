import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import type { Coordinator } from './Coordinator';
import type { Paper } from './Paper';
import type { ReviewerResponse } from './ReviewerResponse';
import type { User } from './User';
import type { AuditLog } from './AuditLog';
import type { SystemPolicy } from './SystemPolicy';
import type { Template } from './Template';
import type { Topic } from './Topic';

@Entity()
export class Lab {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('varchar', { nullable: true, length: 255 })
  overleafGitToken: string | null;

  @OneToOne('Coordinator', 'lab')
  @JoinColumn()
  coordinator: Coordinator;

  @ManyToMany('Paper', 'labs')
  @JoinTable()
  papers: Paper[];

  @ManyToMany('User', 'labs')
  @JoinTable()
  members: User[];

  @ManyToMany('Topic', 'labs')
  @JoinTable()
  topics: Topic[];

  @OneToMany('AuditLog', 'lab')
  auditLogs: AuditLog[];

  @OneToMany('SystemPolicy', 'lab')
  systemPolicies: SystemPolicy[];

  @OneToMany('Template', 'lab')
  templates: Template[];

  @OneToMany('ReviewerResponse', 'lab')
  reviewerResponses: ReviewerResponse[];

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
