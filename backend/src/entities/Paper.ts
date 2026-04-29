import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import type { Coordinator } from './Coordinator';
import type { Topic } from './Topic';
import type { Round } from './Round';
import type { User } from './User';
import type { Lab } from './Lab';

export enum PaperStatus {
  Draft = 'Draft',
  HumanReview = 'HumanReview',
  AIReview = 'AIReview',
  Completed = 'Completed',
  Closed = 'Closed',
  Archived = 'Archived'
}

@Entity()
export class Paper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  abstractText: string;

  @Column()
  creationTime: Date;

  @Column()
  targetVenue: string;

  @Column({
    type: 'simple-enum',
    enum: PaperStatus,
    default: PaperStatus.Draft
  })
  status: PaperStatus;

  @Column({ nullable: true })
  overleafLink: string;

  @ManyToMany('User', 'writtenPapers')
  authors: User[];

  @Column({ type: 'simple-json', nullable: true })
  authorOrder: string[];

  @ManyToMany('Coordinator', 'coordinatedPapers')
  @JoinTable()
  coordinators: Coordinator[];

  @ManyToMany('Topic')
  @JoinTable()
  topics: Topic[];

  @ManyToMany(() => Paper)
  @JoinTable()
  parentPapers: Paper[];

  @OneToMany('Round', 'paper')
  rounds: Round[];

  @ManyToMany('Lab', 'papers')
  labs: Lab[];
}
