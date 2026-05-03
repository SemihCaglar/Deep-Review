import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import type { EmpiricalChecklistConfiguration } from './EmpiricalChecklistConfiguration';

@Entity()
export class EmpiricalChecklistAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  paperId: string;

  @Column()
  configurationId: string;

  @Column()
  checklistItemId: string;

  @Column()
  answer: string;

  @Column()
  confidence: string;

  @Column({ nullable: true, type: 'text' })
  evidence: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @ManyToOne('EmpiricalChecklistConfiguration', 'answers')
  configuration: EmpiricalChecklistConfiguration;
}
