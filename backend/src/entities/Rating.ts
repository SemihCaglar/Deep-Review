import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, ManyToOne } from 'typeorm';
import { Assignment } from './Assignment';
import { LabMember } from './LabMember';

@Entity()
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('float')
  qualityScore: number;

  @Column('float')
  quantityScore: number;

  @Column('float')
  timeScore: number;

  @OneToOne(() => Assignment, assignment => assignment.rating)
  @JoinColumn()
  assignment: Assignment;

  @ManyToOne(() => LabMember)
  rater: LabMember;
}
