import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from './User';

@Entity()
export class BlackoutPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'datetime' })
  startDate: Date;

  @Column({ type: 'datetime' })
  endDate: Date;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @ManyToOne(() => User, user => user.blackoutPeriods, { onDelete: 'CASCADE' })
  member: User;
}