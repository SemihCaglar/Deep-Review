import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import type { Lab } from './Lab';

@Entity()
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @ManyToMany('Lab', 'topics')
  labs: Lab[];
}
