import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import type { Assignment } from './Assignment';
import type { User } from './User';

@Entity()
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 1-5 float
  @Column('float')
  qualityScore: number;

  // 1-5 float
  @Column('float')
  quantityScore: number;

  // 1-5 float
  @Column('float')
  timeScore: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @OneToOne('Assignment', 'rating')
  @JoinColumn()
  assignment: Assignment;

  @ManyToOne('User')
  rater: User;
}
