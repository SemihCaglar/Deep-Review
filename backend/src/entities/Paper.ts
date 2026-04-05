import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, ManyToOne, OneToMany } from 'typeorm';
import { LabMember } from './LabMember';
import { Coordinator } from './Coordinator';
import { Topic } from './Topic';
import { Round } from './Round';

export enum PaperStatus {
  Draft = 'Draft',
  Registered = 'Registered',
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
  manuscriptUrl: string;

  @Column({ nullable: true })
  overleafLink: string;

  @ManyToMany(() => LabMember, member => member.writtenPapers)
  authors: LabMember[];

  @ManyToOne(() => Coordinator, coordinator => coordinator.coordinatedPapers)
  coordinator: Coordinator;

  @ManyToMany(() => Topic)
  @JoinTable()
  topics: Topic[];

  @ManyToMany(() => Paper)
  @JoinTable()
  parentPapers: Paper[];

  @OneToMany(() => Round, round => round.paper)
  rounds: Round[];
}
