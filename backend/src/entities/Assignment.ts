import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, JoinColumn } from 'typeorm';
import { Round } from './Round';
import { LabMember } from './LabMember';
import { Summary } from './Summary';
import { Rating } from './Rating';
import { Extension } from './Extension';

export enum AssignmentStatus {
  Invited = 'Invited',
  Accepted = 'Accepted',
  Declined = 'Declined',
  Overdue = 'Overdue',
  Completed = 'Completed',
  Reassigned = 'Reassigned'
}

@Entity()
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'simple-enum',
    enum: AssignmentStatus,
    default: AssignmentStatus.Invited
  })
  status: AssignmentStatus;

  @ManyToOne(() => Round, round => round.assignments)
  round: Round;

  @ManyToOne(() => LabMember, member => member.assignments)
  reviewer: LabMember;

  @OneToOne(() => Extension, extension => extension.assignment, { nullable: true })
  extension: Extension;

  @OneToOne(() => Summary, summary => summary.assignment, { nullable: true })
  reviewSummary: Summary;

  @OneToOne(() => Rating, rating => rating.assignment, { nullable: true })
  rating: Rating;
}
