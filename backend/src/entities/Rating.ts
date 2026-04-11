import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, ManyToOne } from 'typeorm';
import type { Assignment } from './Assignment';
import type { User } from './User';

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

  @OneToOne('Assignment', 'rating')
  @JoinColumn()
  assignment: Assignment;

  @ManyToOne('User')
  rater: User;
}
