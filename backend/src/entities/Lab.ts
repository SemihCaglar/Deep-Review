import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';
import type { Coordinator } from './Coordinator';
import type { Paper } from './Paper';
import type { User } from './User';

@Entity()
export class Lab {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @OneToOne('Coordinator', 'lab')
  @JoinColumn()
  coordinator: Coordinator;

  @ManyToMany('Paper', 'labs')
  @JoinTable()
  papers: Paper[];

  @ManyToMany('User', 'labs')
  @JoinTable()
  members: User[];

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
