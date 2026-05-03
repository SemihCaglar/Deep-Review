import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import type { EmpiricalChecklistItem } from './EmpiricalChecklistItem';
import type { EmpiricalChecklistAnswer } from './EmpiricalChecklistAnswer';

@Entity()
export class EmpiricalChecklistConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  configKey: string;

  @Column()
  role: string;

  @Column('simple-json')
  standards: string[];

  @Column('text')
  resultUrl: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @OneToMany('EmpiricalChecklistItem', 'configuration')
  items: EmpiricalChecklistItem[];

  @OneToMany('EmpiricalChecklistAnswer', 'configuration')
  answers: EmpiricalChecklistAnswer[];
}
