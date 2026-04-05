import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Round } from './Round';

@Entity()
export class ChecklistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  description: string;

  @Column({ default: false })
  isChecked: boolean;

  @ManyToOne(() => Round, round => round.checklistItems)
  round: Round;
}
