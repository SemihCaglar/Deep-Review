import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { LabMember } from './LabMember';

@Entity()
export class BlackoutPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column({ nullable: true })
  reason: string;

  @ManyToOne(() => LabMember, member => member.blackoutPeriods)
  member: LabMember;
}
