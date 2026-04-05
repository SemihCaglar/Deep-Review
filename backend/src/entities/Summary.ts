import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Assignment } from './Assignment';

@Entity()
export class Summary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  text: string;

  @OneToOne(() => Assignment, assignment => assignment.reviewSummary)
  @JoinColumn()
  assignment: Assignment;
}
