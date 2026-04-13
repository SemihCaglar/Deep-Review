import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Assignment } from './Assignment';

@Entity()
export class Summary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @CreateDateColumn({ type: 'datetime' })
  submittedAt: Date;

  @OneToOne(() => Assignment, assignment => assignment.reviewSummary)
  @JoinColumn()
  assignment: Assignment;
}
