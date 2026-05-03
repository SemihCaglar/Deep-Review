import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import type { EmpiricalChecklistConfiguration } from './EmpiricalChecklistConfiguration';

@Entity()
export class EmpiricalChecklistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  configurationId: string;

  @Column()
  standard: string;

  @Column({ nullable: true, type: 'text' })
  sectionTitle: string | null;

  @Column('text')
  itemText: string;

  @Column()
  itemOrder: number;

  @ManyToOne('EmpiricalChecklistConfiguration', 'items')
  configuration: EmpiricalChecklistConfiguration;
}
